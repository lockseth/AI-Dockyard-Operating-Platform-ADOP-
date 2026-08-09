import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("REDIRECT");
  },
}));

const requireAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
}));

const listActiveMemberships = vi.fn();
const applyActiveTenantSelection = vi.fn();
vi.mock("@/lib/auth/tenant", () => ({
  listActiveMemberships: (...args: unknown[]) => listActiveMemberships(...args),
  applyActiveTenantSelection: (...args: unknown[]) => applyActiveTenantSelection(...args),
}));

// Bootstrap resolver for the single-active-membership, missing-cookie case
// (see route.ts's own comment). Same Branding Follow-up gap as
// loginAction/selectTenantAction: this used to hardcode redirect("/app")
// regardless of role.
describe("GET /tenant/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ userId: "user-1", email: "budi@example.com", mustChangePassword: false });
  });

  it("redirects an owner to /owner/control", async () => {
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-1", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(true);
    const { GET } = await import("./route");

    await expect(GET()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/owner/control");
  });

  it("redirects a non-owner to /app (existing behavior, unchanged)", async () => {
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-2", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["admin"] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(true);
    const { GET } = await import("./route");

    await expect(GET()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("redirects to /select-tenant if applying the selection fails", async () => {
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-3", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(false);
    const { GET } = await import("./route");

    await expect(GET()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/select-tenant");
  });

  it("redirects to /no-access with zero memberships", async () => {
    listActiveMemberships.mockResolvedValue([]);
    const { GET } = await import("./route");

    await expect(GET()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/no-access");
  });

  it("redirects to /select-tenant with more than one membership", async () => {
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-4", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
      { membershipId: "m-5", tenantId: "tenant-2", tenantDisplayName: "Tenant B", roles: ["viewer"] },
    ]);
    const { GET } = await import("./route");

    await expect(GET()).rejects.toThrow("REDIRECT");

    expect(applyActiveTenantSelection).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/select-tenant");
  });
});
