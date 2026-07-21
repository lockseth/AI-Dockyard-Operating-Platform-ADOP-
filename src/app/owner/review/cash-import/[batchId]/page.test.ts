import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
const canAccessOwnerControl = vi.fn();
const getCashImportBatchDetailForActiveTenant = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: () => requireTenantContext(),
}));
vi.mock("@/lib/owner-control/access", () => ({
  canAccessOwnerControl: (roles: string[]) => canAccessOwnerControl(roles),
}));
vi.mock("@/lib/cash-import-staging/service", () => ({
  getCashImportBatchDetailForActiveTenant: (input: unknown) => getCashImportBatchDetailForActiveTenant(input),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
}));

describe("owner cash-import review gate page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("renders notFound for a non-owner (e.g. Admin) without ever looking up the batch", async () => {
    requireTenantContext.mockResolvedValue({ roles: ["admin"], tenantId: "tenant-a" });
    canAccessOwnerControl.mockReturnValue(false);
    const { default: Page } = await import("./page");

    await expect(Page({ params: Promise.resolve({ batchId: "batch-1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getCashImportBatchDetailForActiveTenant).not.toHaveBeenCalled();
  });

  it("renders notFound for an owner when the batch does not resolve in their tenant (cross-tenant)", async () => {
    requireTenantContext.mockResolvedValue({ roles: ["owner"], tenantId: "tenant-a" });
    canAccessOwnerControl.mockReturnValue(true);
    getCashImportBatchDetailForActiveTenant.mockResolvedValue(null);
    const { default: Page } = await import("./page");

    await expect(Page({ params: Promise.resolve({ batchId: "batch-from-another-tenant" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getCashImportBatchDetailForActiveTenant).toHaveBeenCalledWith({ batchId: "batch-from-another-tenant" });
  });

  it("redirects a same-tenant owner straight into the existing approve flow, with no token or tenant id in the path", async () => {
    requireTenantContext.mockResolvedValue({ roles: ["owner"], tenantId: "tenant-a" });
    canAccessOwnerControl.mockReturnValue(true);
    getCashImportBatchDetailForActiveTenant.mockResolvedValue({ batch: { id: "batch-1" }, rows: [], events: [] });
    const { default: Page } = await import("./page");

    await expect(Page({ params: Promise.resolve({ batchId: "batch-1" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/operations/import/batch-1",
    );
  });
});
