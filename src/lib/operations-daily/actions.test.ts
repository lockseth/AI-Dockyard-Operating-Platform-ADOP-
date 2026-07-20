import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/tenant")>("@/lib/auth/tenant");
  return { ...actual, requireTenantContext };
});

const ensureDailyCashPoolForActiveTenant = vi.fn();
vi.mock("@/lib/cash-pool/service", () => ({
  ensureDailyCashPoolForActiveTenant,
  recordCashPoolEntryForActiveTenant: vi.fn(),
}));

const createExpenseDraftForActiveTenant = vi.fn();
vi.mock("@/lib/expense-approvals/service", () => ({
  createExpenseDraftForActiveTenant,
  reviseExpenseDraftForActiveTenant: vi.fn(),
  submitExpenseForActiveTenant: vi.fn(),
  cancelExpenseSubmissionForActiveTenant: vi.fn(),
}));

vi.mock("@/lib/cash-reconciliation/service", () => ({
  createCashReconciliationDraftForActiveTenant: vi.fn(),
  reviseCashReconciliationDraftForActiveTenant: vi.fn(),
  submitCashReconciliationForActiveTenant: vi.fn(),
}));

// Regression guard: source-level checks that the action layer never reads
// tenant/actor/status straight from client input, and never mutates a table
// directly — every mutation must flow through a *ForActiveTenant domain
// service (which re-derives tenant/actor and re-validates with Zod).
describe("operations-daily actions source", () => {
  const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");

  it("never reads tenantId, actor, or status from client FormData", () => {
    expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']actor["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']status["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']createdBy["']/);
  });

  it("never queries a table directly or uses the service-role admin client", () => {
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/supabase\/admin/);
    expect(source).not.toMatch(/createSupabaseAdminClient/);
  });
});

describe("operations-daily actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UnauthorizedTenantRoleError to an Indonesian permission message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    ensureDailyCashPoolForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());

    const { ensureDailyCashPoolAction } = await import("./actions");
    const formData = new FormData();
    formData.set("businessDate", "2026-07-20");

    const result = await ensureDailyCashPoolAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the daily operations page after a successful mutation", async () => {
    ensureDailyCashPoolForActiveTenant.mockResolvedValueOnce({ pool: { id: "pool-1" } });

    const { ensureDailyCashPoolAction } = await import("./actions");
    const formData = new FormData();
    formData.set("businessDate", "2026-07-20");

    const result = await ensureDailyCashPoolAction({}, formData);

    expect(result).toEqual({ pool: { id: "pool-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/daily");
  });

  it("ignores a client-supplied tenantId and uses the server-derived tenant context instead", async () => {
    requireTenantContext.mockResolvedValueOnce({ tenantId: "server-tenant", userId: "user-1", roles: ["admin"] });
    createExpenseDraftForActiveTenant.mockResolvedValueOnce({ submission: { id: "sub-1" } });

    const { createExpenseDraftAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tenantId", "attacker-supplied-tenant");
    formData.set("poolId", "pool-1");
    formData.set("projectId", "project-1");
    formData.set("categoryId", "category-1");
    formData.set("amount", "150000");
    formData.set("description", "Solar");

    await createExpenseDraftAction({}, formData);

    expect(createExpenseDraftForActiveTenant).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "server-tenant" }),
    );
  });
});
