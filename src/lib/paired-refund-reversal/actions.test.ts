import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const reversePairedProjectRefundForActiveTenant = vi.fn();
vi.mock("./service", () => ({ reversePairedProjectRefundForActiveTenant }));

describe("paired-refund-reversal actions source", () => {
  const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");

  it("never reads tenantId or actor from client FormData — only cashEntryId/costEntryId/reason", () => {
    expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']actor["']/);
  });

  it("never queries a table directly or uses the service-role admin client", () => {
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/supabase\/admin/);
  });
});

describe("reversePairedProjectRefundAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UnauthorizedTenantRoleError to an Indonesian permission message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    reversePairedProjectRefundForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());

    const { reversePairedProjectRefundAction } = await import("./actions");
    const formData = new FormData();
    formData.set("cashEntryId", "cash-1");
    formData.set("costEntryId", "cost-1");
    formData.set("reason", "refund keliru");

    const result = await reversePairedProjectRefundAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the transaction history page after a successful reversal", async () => {
    reversePairedProjectRefundForActiveTenant.mockResolvedValueOnce({ result: { id: "reversal-1" } });

    const { reversePairedProjectRefundAction } = await import("./actions");
    const formData = new FormData();
    formData.set("cashEntryId", "cash-1");
    formData.set("costEntryId", "cost-1");
    formData.set("reason", "refund keliru");

    const result = await reversePairedProjectRefundAction({}, formData);

    expect(result).toEqual({ result: { id: "reversal-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/history");
  });
});
