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
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { updateUser, signOut, refreshSession },
    rpc,
  }),
}));

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUser(...args),
  requireAuthenticatedUser: vi.fn(),
}));

const clearMustChangePasswordFlag = vi.fn();
vi.mock("@/lib/user-management/admin-repository", () => ({
  clearMustChangePasswordFlag: (...args: unknown[]) => clearMustChangePasswordFlag(...args),
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
    it("clears must_change_password server-side, refreshes the session, and redirects to /app without signing out", async () => {
      getAuthenticatedUser.mockResolvedValue({ userId: "user-1", email: "budi@example.com", mustChangePassword: true });
      clearMustChangePasswordFlag.mockResolvedValue({});
      const { updatePasswordAction } = await import("./actions");

      await expect(updatePasswordAction("forced", {}, validFormData())).rejects.toThrow("REDIRECT");

      expect(clearMustChangePasswordFlag).toHaveBeenCalledWith("user-1");
      expect(refreshSession).toHaveBeenCalledTimes(1);
      expect(signOut).not.toHaveBeenCalled();
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
