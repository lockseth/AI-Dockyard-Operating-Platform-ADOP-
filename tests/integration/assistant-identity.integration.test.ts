import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface src/lib/assistant-identity's
// repository/admin-repository use (real authenticated HTTP requests, not
// mocks), same split as expense-duplicate-detection.integration.test.ts.
// pgTAP (supabase/tests/database/assistant_identity_pairing.test.sql) is
// the exhaustive state-machine proof; this suite proves the real
// HTTP/PostgREST/JWT boundary actually enforces the same thing end-to-end.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "assistant-identity.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";
const TENANT_B_ID = "b2222222-2222-4222-8222-222222222222";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  tenantId: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, {
    emailPrefix: params.emailPrefix,
    memberships: [{ tenantId: params.tenantId, role: params.role }],
  });
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

// client_contacts.whatsapp_number carries no uniqueness constraint below the
// verified tier, but every test that needs a fresh number uses a
// randomized, clearly-synthetic one to avoid cross-test/cross-suite
// collisions inside the shared local database (same reasoning as
// expense-duplicate-detection.integration.test.ts's randomBusinessDate()).
function randomFakeE164(): string {
  const suffix = Math.floor(1_000_000 + Math.random() * 8_999_999);
  return `+62800${suffix}`;
}

describe("assistant identity pairing & client verification — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let ownerB: EphemeralMember;
  let clientAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "aip-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "aip-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({
      emailPrefix: "aip-reviewer-a",
      tenantId: TENANT_A_ID,
      role: "reviewer",
    });
    createdUserIds.push(reviewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "aip-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "AIP Integration Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;
  });

  afterAll(async () => {
    if (clientAId) {
      await admin.from("clients").delete().eq("id", clientAId);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("owner pairing lifecycle: issue -> complete (service-role) -> verified -> revoke", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();

    const { data: issued, error: issueError } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    expect(issueError).toBeNull();
    const { identity_id: identityId, challenge_code: code } = issued![0];
    expect(identityId).toBeTruthy();
    expect(code).toHaveLength(6);

    // The "complete" side is service_role-only — the real caller in
    // production is the future internal inbound endpoint, exercised here
    // directly via the admin client exactly as admin-repository.ts does.
    const { data: completed, error: completeError } = await admin.rpc("assistant_complete_pairing", {
      p_channel: "whatsapp",
      p_normalized_address: address,
      p_code: code,
    });
    expect(completeError).toBeNull();
    expect(completed![0]).toMatchObject({ outcome: "verified", identity_id: identityId, user_id: ownerA.id });

    const { data: revoked, error: revokeError } = await ownerAClient.rpc("assistant_revoke_pairing", {
      p_identity_id: identityId,
      p_reason: "integration test cleanup",
    });
    expect(revokeError).toBeNull();
    expect(revoked.status).toBe("revoked");
  });

  it("admin self-pairing succeeds independently of the owner's binding", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const address = randomFakeE164();

    const { data: issued, error: issueError } = await adminAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    expect(issueError).toBeNull();

    const { data: completed, error: completeError } = await admin.rpc("assistant_complete_pairing", {
      p_channel: "whatsapp",
      p_normalized_address: address,
      p_code: issued![0].challenge_code,
    });
    expect(completeError).toBeNull();
    expect(completed![0]).toMatchObject({ outcome: "verified", user_id: adminA.id });
  });

  it("reviewer cannot issue a pairing challenge (unauthorized role denial)", async () => {
    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error } = await reviewerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: randomFakeE164(),
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("STOP: owner of a different tenant cannot issue a pairing challenge for tenant A (tenant isolation)", async () => {
    const ownerBClient = await signInAsMember(ownerB.email);
    const { error } = await ownerBClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: randomFakeE164(),
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("wrong code returns invalid_code and the correct code afterward still completes (replay-safe attempt tracking)", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];

    const { data: wrong, error: wrongError } = await admin.rpc("assistant_complete_pairing", {
      p_channel: "whatsapp",
      p_normalized_address: address,
      p_code: "WRONGCODE",
    });
    expect(wrongError).toBeNull();
    expect(wrong![0].outcome).toBe("invalid_code");

    const { data: right, error: rightError } = await admin.rpc("assistant_complete_pairing", {
      p_channel: "whatsapp",
      p_normalized_address: address,
      p_code: code,
    });
    expect(rightError).toBeNull();
    expect(right![0]).toMatchObject({ outcome: "verified", identity_id: identityId });

    // Replay of the now-consumed code: not_found, not a second verification.
    const { data: replay, error: replayError } = await admin.rpc("assistant_complete_pairing", {
      p_channel: "whatsapp",
      p_normalized_address: address,
      p_code: code,
    });
    expect(replayError).toBeNull();
    expect(replay![0].outcome).toBe("not_found");

    await ownerAClient.rpc("assistant_revoke_pairing", { p_identity_id: identityId });
  });

  it("client verification lifecycle: issue -> complete (service-role) -> verified -> reset", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const number = randomFakeE164();

    const { data: contact, error: contactError } = await ownerAClient
      .from("client_contacts")
      .insert({
        tenant_id: TENANT_A_ID,
        client_id: clientAId,
        full_name: "AIP Integration PIC",
        whatsapp_number: number,
        created_by: ownerA.id,
      })
      .select("id")
      .single();
    expect(contactError).toBeNull();
    const contactId = contact!.id;

    const { data: issued, error: issueError } = await ownerAClient.rpc(
      "assistant_issue_client_verification_challenge",
      { p_contact_id: contactId },
    );
    expect(issueError).toBeNull();
    const code = issued![0].challenge_code;
    expect(code).toHaveLength(6);

    const { data: completed, error: completeError } = await admin.rpc(
      "assistant_complete_client_verification",
      { p_tenant_id: TENANT_A_ID, p_whatsapp_number: number, p_code: code },
    );
    expect(completeError).toBeNull();
    expect(completed![0]).toMatchObject({ outcome: "verified", contact_id: contactId });

    const { data: afterVerify } = await ownerAClient
      .from("client_contacts")
      .select("whatsapp_verification_status")
      .eq("id", contactId)
      .single();
    expect(afterVerify!.whatsapp_verification_status).toBe("verified");

    const { data: reset, error: resetError } = await ownerAClient.rpc("assistant_reset_client_verification", {
      p_contact_id: contactId,
      p_reason: "integration test cleanup",
    });
    expect(resetError).toBeNull();
    expect(reset.whatsapp_verification_status).toBe("revoked");

    await admin.from("client_contacts").delete().eq("id", contactId);
  });

  it("STOP: changing whatsapp_number resets an in-progress verification (real UPDATE through PostgREST, not just the RPC path)", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const firstNumber = randomFakeE164();

    const { data: contact } = await ownerAClient
      .from("client_contacts")
      .insert({
        tenant_id: TENANT_A_ID,
        client_id: clientAId,
        full_name: "AIP Number Change PIC",
        whatsapp_number: firstNumber,
        created_by: ownerA.id,
      })
      .select("id")
      .single();
    const contactId = contact!.id;

    await ownerAClient.rpc("assistant_issue_client_verification_challenge", { p_contact_id: contactId });

    const { error: updateError } = await ownerAClient
      .from("client_contacts")
      .update({ whatsapp_number: randomFakeE164() })
      .eq("id", contactId);
    expect(updateError).toBeNull();

    const { data: afterChange } = await ownerAClient
      .from("client_contacts")
      .select("whatsapp_verification_status")
      .eq("id", contactId)
      .single();
    expect(afterChange!.whatsapp_verification_status).toBe("unverified");

    await admin.from("client_contacts").delete().eq("id", contactId);
  });
});
