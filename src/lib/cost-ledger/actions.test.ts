import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const reverseProjectExpenseForActiveTenant = vi.fn();
vi.mock("./service", () => ({ reverseProjectExpenseForActiveTenant }));

describe("cost-ledger actions source", () => {
  const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");

  it("never reads tenantId or actor from client FormData — only entryId/reason", () => {
    expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']actor["']/);
  });

  it("never queries a table directly or uses the service-role admin client", () => {
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/supabase\/admin/);
  });
});

describe("reverseProjectExpenseAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UnauthorizedTenantRoleError to an Indonesian permission message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    reverseProjectExpenseForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());

    const { reverseProjectExpenseAction } = await import("./actions");
    const formData = new FormData();
    formData.set("entryId", "entry-1");
    formData.set("reason", "kategori salah");

    const result = await reverseProjectExpenseAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the transaction history page after a successful reversal", async () => {
    reverseProjectExpenseForActiveTenant.mockResolvedValueOnce({ entry: { id: "reversal-1" } });

    const { reverseProjectExpenseAction } = await import("./actions");
    const formData = new FormData();
    formData.set("entryId", "entry-1");
    formData.set("reason", "kategori salah");

    const result = await reverseProjectExpenseAction({}, formData);

    expect(result).toEqual({ entry: { id: "reversal-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/history");
  });
});
