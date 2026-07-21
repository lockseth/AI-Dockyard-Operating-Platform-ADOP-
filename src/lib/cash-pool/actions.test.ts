import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const reverseCashPoolEntryForActiveTenant = vi.fn();
vi.mock("./service", () => ({ reverseCashPoolEntryForActiveTenant }));

describe("cash-pool actions source", () => {
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

describe("reverseCashPoolEntryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps UnauthorizedTenantRoleError to an Indonesian permission message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    reverseCashPoolEntryForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());

    const { reverseCashPoolEntryAction } = await import("./actions");
    const formData = new FormData();
    formData.set("entryId", "entry-1");
    formData.set("reason", "koreksi nominal");

    const result = await reverseCashPoolEntryAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the transaction history page after a successful reversal", async () => {
    reverseCashPoolEntryForActiveTenant.mockResolvedValueOnce({ entry: { id: "reversal-1" } });

    const { reverseCashPoolEntryAction } = await import("./actions");
    const formData = new FormData();
    formData.set("entryId", "entry-1");
    formData.set("reason", "koreksi nominal");

    const result = await reverseCashPoolEntryAction({}, formData);

    expect(result).toEqual({ entry: { id: "reversal-1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/operations/history");
  });
});
