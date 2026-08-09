import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
// Mirrors next/navigation's real redirect(), which throws to unwind the
// current Server Action rather than returning — without this, code after a
// taken redirect branch (e.g. the "forced" flow's null-session guard) would
// keep running in this mocked environment only.
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("REDIRECT");
  },
}));

const updateUser = vi.fn();
const rpc = vi.fn();
const signOut = vi.fn();
const refreshSession = vi.fn();
const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { updateUser, signOut, refreshSession, signInWithPassword },
    rpc,
  }),
}));

const getAuthenticatedUser = vi.fn();
const requireAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
  requireAuthenticatedUser: (...args: unknown[]) => requireAuthenticatedUser(...args),
}));

const clearMustChangePasswordFlag = vi.fn();
vi.mock("@/lib/user-management/admin-repository", () => ({
  clearMustChangePasswordFlag: (...args: unknown[]) => clearMustChangePasswordFlag(...args),
}));

const listActiveMemberships = vi.fn();
const applyActiveTenantSelection = vi.fn();
const hasPendingInvitations = vi.fn();
vi.mock("@/lib/auth/tenant", () => ({
  listActiveMemberships: (...args: unknown[]) => listActiveMemberships(...args),
  applyActiveTenantSelection: (...args: unknown[]) => applyActiveTenantSelection(...args),
  hasPendingInvitations: (...args: unknown[]) => hasPendingInvitations(...args),
  clearActiveTenantCookie: vi.fn(),
}));

function validFormData() {
  const formData = new FormData();
  formData.set("password", "Str0ngNewPass!");
  formData.set("confirmPassword", "Str0ngNewPass!");
  return formData;
}

// updatePasswordAction is shared by /reset-password (flow="recovery" for a
// real forgot-password link, flow="forced" for the Gate 6G-H
// must_change_password redirect) and /invite/accept (flow="invite"). Only
// the "forced" branch is new here — the others are asserted mainly to prove
// adding it didn't change their existing behavior.
describe("updatePasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUser.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
  });

  it("returns a friendly error without touching must_change_password when updateUser itself fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "expired token" } });
    const { updatePasswordAction } = await import("./actions");

    const result = await updatePasswordAction("forced", {}, validFormData());

    expect(result.error).toMatch(/Tautan mungkin sudah tidak valid/);
    expect(clearMustChangePasswordFlag).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  describe("flow = recovery (unaffected by Gate 6G-H)", () => {
    it("signs the session out and redirects to /login?passwordUpdated=1", async () => {
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("recovery", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(redirectMock).toHaveBeenCalledWith("/login?passwordUpdated=1");
      expect(clearMustChangePasswordFlag).not.toHaveBeenCalled();
    });
  });

  describe("flow = invite (unaffected by Gate 6G-H)", () => {
    it("stays signed in and redirects to /invite/accept", async () => {
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("invite", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(signOut).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith("/invite/accept");
      expect(clearMustChangePasswordFlag).not.toHaveBeenCalled();
    });
  });

  describe("flow = forced (Gate 6G-H LOGIN ENFORCEMENT)", () => {
    it("clears must_change_password server-side, refreshes the session, and redirects an owner to /owner/control without signing out", async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: "user-1", email: "budi@example.com", mustChangePassword: true });
      clearMustChangePasswordFlag.mockResolvedValue({});
      listActiveMemberships.mockResolvedValue([
        { membershipId: "m-1", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
      ]);
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("forced", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(clearMustChangePasswordFlag).toHaveBeenCalledWith("user-1");
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(signOut).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith("/owner/control");
    });

    it("redirects a non-owner single-membership user to /app", async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: "user-2", email: "admin@example.com", mustChangePassword: true });
      clearMustChangePasswordFlag.mockResolvedValue({});
      listActiveMemberships.mockResolvedValue([
        { membershipId: "m-2", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["admin"] },
      ]);
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("forced", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(redirectMock).toHaveBeenCalledWith("/app");
    });

    it("falls back to /app for a multi-membership user (no active-tenant cookie resolved yet at this point)", async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: "user-3", email: "multi@example.com", mustChangePassword: true });
      clearMustChangePasswordFlag.mockResolvedValue({});
      listActiveMemberships.mockResolvedValue([
        { membershipId: "m-3", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
        { membershipId: "m-4", tenantId: "tenant-2", tenantDisplayName: "Tenant B", roles: ["viewer"] },
      ]);
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("forced", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(redirectMock).toHaveBeenCalledWith("/app");
    });

    it("redirects to /login instead if the session is somehow gone by this point", async () => {
      getAuthenticatedUser.mockResolvedValue(null);
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("forced", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(clearMustChangePasswordFlag).not.toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith("/login");
    });

    it("reports a recoverable error and does not redirect to /app if clearing the flag fails", async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: "user-1", email: "budi@example.com", mustChangePassword: true });
      clearMustChangePasswordFlag.mockResolvedValue({ error: "admin api unreachable" });
      const { updatePasswordAction } = await import("./actions");

      const result = await updatePasswordAction("forced", {}, validFormData());

      expect(result.error).toBeTruthy();
      expect(JSON.stringify(result)).not.toMatch(/admin api unreachable/);
      expect(refreshSession).not.toHaveBeenCalled();
      expect(redirectMock).not.toHaveBeenCalledWith("/app");
    });
  });
});

function loginFormData(email = "user@example.com", password = "Str0ngPass!") {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

// Branding Follow-up gap fix: every single-membership entry point used to
// hardcode redirect("/app") regardless of role, so an owner's default
// landing was the admin/operational dashboard instead of /owner/control —
// /owner/control was only ever reached by clicking "Dashboard Owner" in the
// sidebar. resolvePostAuthDestination (wrapping the same canAccessOwnerControl
// check /owner/control's own page enforces) is now the single source of
// truth for this decision; these tests prove it actually changed the
// redirect target for an owner without touching non-owner behavior.
describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a single-membership owner to /owner/control", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-1", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(true);
    const { loginAction } = await import("./actions");

    await expect(loginAction({}, loginFormData())).rejects.toThrow("REDIRECT");

    expect(applyActiveTenantSelection).toHaveBeenCalledWith("user-1", "tenant-1");
    expect(redirectMock).toHaveBeenCalledWith("/owner/control");
  });

  it("redirects a single-membership admin to /app (existing operational dashboard, unchanged)", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-2", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["admin"] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(true);
    const { loginAction } = await import("./actions");

    await expect(loginAction({}, loginFormData())).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it.each(["reviewer", "viewer"] as const)("redirects a single-membership %s to /app (unchanged)", async (role) => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-3" } }, error: null });
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-3", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: [role] },
    ]);
    applyActiveTenantSelection.mockResolvedValue(true);
    const { loginAction } = await import("./actions");

    await expect(loginAction({}, loginFormData())).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("redirects to /select-tenant for a multi-membership user, before any role/destination is resolved", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-4" } }, error: null });
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-4", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
      { membershipId: "m-5", tenantId: "tenant-2", tenantDisplayName: "Tenant B", roles: ["viewer"] },
    ]);
    const { loginAction } = await import("./actions");

    await expect(loginAction({}, loginFormData())).rejects.toThrow("REDIRECT");

    expect(applyActiveTenantSelection).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/select-tenant");
  });

  it("redirects to /no-access for zero memberships without pending invitations", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-5" } }, error: null });
    listActiveMemberships.mockResolvedValue([]);
    hasPendingInvitations.mockResolvedValue(false);
    const { loginAction } = await import("./actions");

    await expect(loginAction({}, loginFormData())).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/no-access");
  });
});

describe("selectTenantAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUser.mockResolvedValue({ userId: "user-1", email: "budi@example.com", mustChangePassword: false });
  });

  function tenantFormData(tenantId: string) {
    const formData = new FormData();
    formData.set("tenantId", tenantId);
    return formData;
  }

  it("redirects to /owner/control when the selected tenant's role is owner", async () => {
    applyActiveTenantSelection.mockResolvedValue(true);
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-1", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
      { membershipId: "m-2", tenantId: "tenant-2", tenantDisplayName: "Tenant B", roles: ["admin"] },
    ]);
    const { selectTenantAction } = await import("./actions");

    await expect(selectTenantAction({}, tenantFormData("tenant-1"))).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/owner/control");
  });

  it("redirects to /app when the selected tenant's role is not owner", async () => {
    applyActiveTenantSelection.mockResolvedValue(true);
    listActiveMemberships.mockResolvedValue([
      { membershipId: "m-1", tenantId: "tenant-1", tenantDisplayName: "Tenant A", roles: ["owner"] },
      { membershipId: "m-2", tenantId: "tenant-2", tenantDisplayName: "Tenant B", roles: ["admin"] },
    ]);
    const { selectTenantAction } = await import("./actions");

    await expect(selectTenantAction({}, tenantFormData("tenant-2"))).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("returns an error and does not redirect when the tenant selection is rejected", async () => {
    applyActiveTenantSelection.mockResolvedValue(false);
    const { selectTenantAction } = await import("./actions");

    const result = await selectTenantAction({}, tenantFormData("tenant-9"));

    expect(result.error).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
