import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
const createSupabaseAdminClient = vi.fn(() => ({
  auth: { admin: { generateLink } },
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

const getServerEnv = vi.fn(() => ({ APP_URL: "https://adop-demo-gema.vercel.app" }));
vi.mock("@/lib/env/server", () => ({ getServerEnv }));

beforeEach(() => {
  vi.clearAllMocks();
  getServerEnv.mockReturnValue({ APP_URL: "https://adop-demo-gema.vercel.app" });
});

describe("generateInviteAccessLink", () => {
  it("calls admin.generateLink with type invite and a redirectTo scoped to this app's own callback", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "new-user-1" }, properties: { action_link: "https://supabase.example/verify?token=abc" } },
      error: null,
    });
    const { generateInviteAccessLink } = await import("./admin-repository");

    const result = await generateInviteAccessLink("budi@example.com", "Budi", "/invite/accept");

    expect(generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "budi@example.com",
      options: {
        data: { display_name: "Budi" },
        redirectTo: "https://adop-demo-gema.vercel.app/auth/implicit-confirm?next=%2Finvite%2Faccept",
      },
    });
    expect(result).toEqual({ userId: "new-user-1", actionLink: "https://supabase.example/verify?token=abc" });
  });

  it("never falls back to inviteUserByEmail or any other email-sending call", async () => {
    generateLink.mockResolvedValue({
      data: { user: { id: "new-user-1" }, properties: { action_link: "https://supabase.example/verify?token=abc" } },
      error: null,
    });
    const admin = await import("./admin-repository");

    await admin.generateInviteAccessLink("budi@example.com", "Budi", "/invite/accept");

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(generateLink).toHaveBeenCalledTimes(1);
    // The mocked admin client only ever exposes auth.admin.generateLink —
    // asserting the call shape above already proves inviteUserByEmail (a
    // sibling method this mock does not even provide) was never reached.
  });

  it("fails closed — a provider error never yields a link or user id", async () => {
    generateLink.mockResolvedValue({ data: { user: null, properties: null }, error: { message: "service unavailable" } });
    const { generateInviteAccessLink } = await import("./admin-repository");

    const result = await generateInviteAccessLink("budi@example.com", "Budi", "/invite/accept");

    expect(result.actionLink).toBeUndefined();
    expect(result.userId).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});

describe("generateRecoveryAccessLink", () => {
  it("calls admin.generateLink with type recovery and a redirectTo scoped to this app's own callback", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { action_link: "https://supabase.example/verify?token=xyz" } },
      error: null,
    });
    const { generateRecoveryAccessLink } = await import("./admin-repository");

    const result = await generateRecoveryAccessLink("budi@example.com", "/reset-password");

    expect(generateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "budi@example.com",
      options: { redirectTo: "https://adop-demo-gema.vercel.app/auth/implicit-confirm?next=%2Freset-password" },
    });
    expect(result).toEqual({ actionLink: "https://supabase.example/verify?token=xyz" });
  });

  it("never sets a password or mutates the account — only auth.admin.generateLink is called", async () => {
    generateLink.mockResolvedValue({
      data: { properties: { action_link: "https://supabase.example/verify?token=xyz" } },
      error: null,
    });
    const admin = await import("./admin-repository");

    await admin.generateRecoveryAccessLink("budi@example.com", "/reset-password");

    expect(generateLink).toHaveBeenCalledTimes(1);
  });

  it("fails closed — a provider error never yields a link", async () => {
    generateLink.mockResolvedValue({ data: { properties: null }, error: { message: "service unavailable" } });
    const { generateRecoveryAccessLink } = await import("./admin-repository");

    const result = await generateRecoveryAccessLink("budi@example.com", "/reset-password");

    expect(result.actionLink).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});
