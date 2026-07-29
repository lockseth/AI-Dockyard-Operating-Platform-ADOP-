import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, createEphemeralMember, type EphemeralMember } from "./support/members";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "password-reset.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";

const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

describe("password reset — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let member: EphemeralMember;

  beforeAll(async () => {
    member = await createEphemeralMember(admin, {
      emailPrefix: "pwreset-member",
      memberships: [{ tenantId: TENANT_A_ID, role: "viewer" }],
    });
    createdUserIds.push(member.id);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("resetPasswordForEmail returns the same (no-error) shape for a registered and an unregistered email", async () => {
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const registered = await anonClient.auth.resetPasswordForEmail(member.email, {
      redirectTo: "http://127.0.0.1:3000/auth/implicit-confirm?next=%2Freset-password",
    });
    const unregistered = await anonClient.auth.resetPasswordForEmail("definitely-not-registered@adop-integration.local", {
      redirectTo: "http://127.0.0.1:3000/auth/implicit-confirm?next=%2Freset-password",
    });

    // Supabase's own resetPasswordForEmail never reveals whether the email
    // exists — both calls resolve the same way (no error) regardless.
    expect(registered.error).toBeNull();
    expect(unregistered.error).toBeNull();
  });

  it("verifyOtp rejects an invalid/garbage token_hash", async () => {
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await anonClient.auth.verifyOtp({
      type: "recovery",
      token_hash: "not-a-real-token-hash",
    });

    expect(error).not.toBeNull();
  });

  it("log_own_password_reset_completed records an audit event with no password/token value", async () => {
    // Sign in as the member via password (the ephemeral fixture's known
    // password), then call the RPC as their own session — exercising
    // exactly what updatePasswordAction does after a successful
    // auth.updateUser() call.
    const memberClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { EPHEMERAL_PASSWORD } = await import("./support/members");
    const { error: signInError } = await memberClient.auth.signInWithPassword({
      email: member.email,
      password: EPHEMERAL_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { error: rpcError } = await memberClient.rpc("log_own_password_reset_completed");
    expect(rpcError).toBeNull();

    const { data: events } = await admin
      .from("access_audit_events")
      .select("action, actor_user_id, before_data, after_data")
      .eq("tenant_id", TENANT_A_ID)
      .eq("action", "password_reset_completed")
      .eq("actor_user_id", member.id);

    expect(events).toHaveLength(1);
    const text = JSON.stringify(events?.[0].before_data) + JSON.stringify(events?.[0].after_data);
    expect(text.toLowerCase()).not.toMatch(/password|token/);
  });
});
