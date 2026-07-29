import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
// Mirrors next/navigation's real redirect(), which throws to unwind the
// current render/action rather than returning — without this, requireAuthenticatedUser
// would (in this mocked environment only) fall through past a taken redirect
// branch and touch `user` again while it's still null.
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    throw new Error("REDIRECT");
  },
}));

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
}));

function claimsResult(claims: Record<string, unknown> | null, error: unknown = null) {
  return { data: claims ? { claims } : null, error };
}

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when getClaims errors", async () => {
    getClaims.mockResolvedValue(claimsResult(null, new Error("invalid token")));
    const { getAuthenticatedUser } = await import("./session");

    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("reads mustChangePassword straight off the verified JWT's app_metadata claim", async () => {
    getClaims.mockResolvedValue(
      claimsResult({ sub: "user-1", email: "budi@example.com", app_metadata: { must_change_password: true } }),
    );
    const { getAuthenticatedUser } = await import("./session");

    const user = await getAuthenticatedUser();

    expect(user).toEqual({ userId: "user-1", email: "budi@example.com", mustChangePassword: true });
  });

  it("defaults mustChangePassword to false when app_metadata carries no such flag", async () => {
    getClaims.mockResolvedValue(claimsResult({ sub: "user-1", email: "budi@example.com", app_metadata: {} }));
    const { getAuthenticatedUser } = await import("./session");

    const user = await getAuthenticatedUser();

    expect(user?.mustChangePassword).toBe(false);
  });
});

// LOGIN ENFORCEMENT (Gate 6G-H): requireAuthenticatedUser is the single
// server-side gate every /app/*, /select-tenant, and /tenant/* page
// ultimately calls through (directly or via requireTenantContext) — proving
// it here is proving the gate works everywhere it's used.
describe("requireAuthenticatedUser — must_change_password gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when there is no authenticated user at all", async () => {
    getClaims.mockResolvedValue(claimsResult(null));
    const { requireAuthenticatedUser } = await import("./session");

    await expect(requireAuthenticatedUser()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /reset-password (not /login) when must_change_password is set, without ever returning the user", async () => {
    getClaims.mockResolvedValue(
      claimsResult({ sub: "user-1", email: "budi@example.com", app_metadata: { must_change_password: true } }),
    );
    const { requireAuthenticatedUser } = await import("./session");

    await expect(requireAuthenticatedUser()).rejects.toThrow("REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/reset-password");
    expect(redirectMock).not.toHaveBeenCalledWith("/login");
  });

  it("returns the user without redirecting when must_change_password is not set", async () => {
    getClaims.mockResolvedValue(
      claimsResult({ sub: "user-1", email: "budi@example.com", app_metadata: {} }),
    );
    const { requireAuthenticatedUser } = await import("./session");

    const user = await requireAuthenticatedUser();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(user).toEqual({ userId: "user-1", email: "budi@example.com", mustChangePassword: false });
  });
});
