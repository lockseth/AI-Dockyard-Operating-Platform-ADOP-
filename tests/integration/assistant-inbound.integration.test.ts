import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase AND the real Next.js route handler — invoked directly
// as a function (no HTTP server needed in this harness) so the exact code
// path a live n8n delivery takes (signature verify -> zod parse -> handler
// -> repository -> real RPC) is exercised end-to-end, not mocked. pgTAP
// (supabase/tests/database/assistant_inbound_gateway.test.sql) is the
// exhaustive state-machine proof; this suite proves the HTTP/signature
// boundary and true concurrency a single pgTAP connection cannot.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;
const SIGNING_SECRET = process.env.INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !INTERNAL_SECRET || !SIGNING_SECRET) {
  throw new Error(
    "assistant-inbound.integration.test requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, " +
      "SUPABASE_SERVICE_ROLE_KEY, INTERNAL_API_SECRET and INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET in " +
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

// Randomized synthetic numbers to avoid cross-test/cross-suite collisions in
// the shared local database (same reasoning as assistant-identity.
// integration.test.ts's randomFakeE164()).
function randomFakeE164(): string {
  const suffix = Math.floor(1_000_000 + Math.random() * 8_999_999);
  return `+62809${suffix}`;
}

function sign(secret: string, timestampHeader: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`, "utf8").digest("hex");
}

interface AssistantInboundResponseBody {
  result?: string;
  error?: string;
  reply?: { replyRequired: boolean; safeReplyCode: string; providerMessageId: string };
}

async function postInbound(
  envelope: Record<string, unknown>,
  overrides: {
    timestampHeader?: string;
    signatureHeader?: string;
    internalSecretHeader?: string;
    omitSignatureHeaders?: boolean;
  } = {},
): Promise<{ status: number; body: AssistantInboundResponseBody }> {
  const { POST } = await import("@/app/api/internal/assistant/inbound/route");
  const rawBody = JSON.stringify(envelope);
  const timestampHeader = overrides.timestampHeader ?? String(Math.floor(Date.now() / 1000));

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": overrides.internalSecretHeader ?? INTERNAL_SECRET!,
  };
  if (!overrides.omitSignatureHeaders) {
    headers["x-assistant-signature-timestamp"] = timestampHeader;
    headers["x-assistant-signature"] = overrides.signatureHeader ?? sign(SIGNING_SECRET!, timestampHeader, rawBody);
  }

  const request = new NextRequest("http://localhost/api/internal/assistant/inbound", {
    method: "POST",
    headers,
    body: rawBody,
  });
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

function pairEnvelope(senderAddress: string, code: string, providerMessageId?: string) {
  return {
    provider: "fonnte",
    providerMessageId: providerMessageId ?? `wamid.${crypto.randomUUID()}`,
    channel: "whatsapp",
    senderAddress,
    messageText: `PAIR ${code}`,
    providerTimestamp: String(Math.floor(Date.now() / 1000)),
  };
}

function barePairEnvelope(senderAddress: string, code: string, providerMessageId?: string) {
  return {
    ...pairEnvelope(senderAddress, code, providerMessageId),
    messageText: code,
  };
}

function verifyEnvelope(senderAddress: string, code: string, providerMessageId?: string) {
  return {
    provider: "fonnte",
    providerMessageId: providerMessageId ?? `wamid.${crypto.randomUUID()}`,
    channel: "whatsapp",
    senderAddress,
    messageText: `VERIFY ${code}`,
    providerTimestamp: String(Math.floor(Date.now() / 1000)),
  };
}

describe("assistant inbound gateway — real local Supabase + real route handler", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let ownerB: EphemeralMember;
  let clientAId: string;
  let clientBId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "aib-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "aib-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "aib-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "AIB Integration Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;
    createdClientIds.push(clientAId);

    const { data: clientB } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerB.id, display_name: "AIB Integration Client B" })
      .select("id")
      .single();
    clientBId = clientB!.id;
    createdClientIds.push(clientBId);
  });

  afterAll(async () => {
    for (const id of createdClientIds) {
      await admin.from("clients").delete().eq("id", id);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("valid Owner PAIR: real POST completes pairing and marks the inbound event processed exactly once", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];

    const { status, body } = await postInbound(pairEnvelope(address, code));

    expect(status).toBe(200);
    expect(body.result).toBe("processed");
    expect(body.reply!).toMatchObject({ replyRequired: true, safeReplyCode: "paired" });

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("verified");

    // Free ownerA's one-verified-binding-per-(tenant,user,channel) slot
    // (assistant_channel_identities_verified_user_uidx) so later tests that
    // reuse ownerA for a fresh PAIR completion don't hit ambiguous_binding.
    await ownerAClient.rpc("assistant_revoke_pairing", { p_identity_id: identityId });
  });

  it("valid bare pairing code: real POST completes pairing without requiring a technical prefix", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];

    const { status, body } = await postInbound(barePairEnvelope(address, code));

    expect(status).toBe(200);
    expect(body.reply!).toMatchObject({ replyRequired: true, safeReplyCode: "paired" });

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("verified");

    await ownerAClient.rpc("assistant_revoke_pairing", { p_identity_id: identityId });
  });

  it("valid Admin PAIR: an admin's own pairing completes independently of the owner's", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const address = randomFakeE164();
    const { data: issued } = await adminAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { challenge_code: code } = issued![0];

    const { status, body } = await postInbound(pairEnvelope(address, code));

    expect(status).toBe(200);
    expect(body.reply!.safeReplyCode).toBe("paired");
  });

  it("invalid PAIR code returns invalid_or_expired and never verifies the pending challenge", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId } = issued![0];

    const { status, body } = await postInbound(pairEnvelope(address, "ZZZZZZ"));

    expect(status).toBe(200);
    expect(body.reply!.safeReplyCode).toBe("invalid_or_expired");

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("pending");
  });

  it("expired PAIR code returns invalid_or_expired even though the code itself is correct", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];

    await admin
      .from("assistant_channel_identities")
      .update({ challenge_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", identityId);

    const { body } = await postInbound(pairEnvelope(address, code));
    expect(body.reply!.safeReplyCode).toBe("invalid_or_expired");
  });

  it("valid client VERIFY: real POST completes verification for a contact PIC", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const number = randomFakeE164();
    const { data: contact } = await ownerAClient
      .from("client_contacts")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, full_name: "AIB PIC", whatsapp_number: number, created_by: ownerA.id })
      .select("id")
      .single();
    const contactId = contact!.id;

    const { data: issued } = await ownerAClient.rpc("assistant_issue_client_verification_challenge", {
      p_contact_id: contactId,
    });
    const code = issued![0].challenge_code;

    const { status, body } = await postInbound(verifyEnvelope(number, code));

    expect(status).toBe(200);
    expect(body.reply!.safeReplyCode).toBe("verified");

    const { data: row } = await admin
      .from("client_contacts")
      .select("whatsapp_verification_status")
      .eq("id", contactId)
      .single();
    expect(row!.whatsapp_verification_status).toBe("verified");

    await admin.from("client_contacts").delete().eq("id", contactId);
  });

  it("STOP: ambiguous cross-tenant VERIFY (two tenants pending on the same number/code) fails closed, never auto-picked", async () => {
    const number = randomFakeE164();
    const sharedCode = "SHAR3D";

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: contactA } = await ownerAClient
      .from("client_contacts")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, full_name: "AIB Ambiguous A", whatsapp_number: number, created_by: ownerA.id })
      .select("id")
      .single();
    await ownerAClient.rpc("assistant_issue_client_verification_challenge", { p_contact_id: contactA!.id });

    const ownerBClient = await signInAsMember(ownerB.email);
    const { data: contactB } = await ownerBClient
      .from("client_contacts")
      .insert({ tenant_id: TENANT_B_ID, client_id: clientBId, full_name: "AIB Ambiguous B", whatsapp_number: number, created_by: ownerB.id })
      .select("id")
      .single();
    await ownerBClient.rpc("assistant_issue_client_verification_challenge", { p_contact_id: contactB!.id });

    // Pin both rows to the same digest — reissue is random, so this
    // deterministically forces the cross-tenant collision rather than
    // relying on a 1-in-32^6 chance (test-only setup, not a runtime path).
    const digestHex = createHash("sha256").update(sharedCode).digest("hex");
    await admin
      .from("client_contacts")
      .update({ whatsapp_verification_digest: digestHex })
      .in("id", [contactA!.id, contactB!.id]);

    const { status, body } = await postInbound(verifyEnvelope(number, sharedCode));

    expect(status).toBe(200);
    expect(body.reply!.safeReplyCode).toBe("ambiguous");

    const { data: rows } = await admin
      .from("client_contacts")
      .select("whatsapp_verification_status")
      .in("id", [contactA!.id, contactB!.id]);
    expect(rows!.every((r) => r.whatsapp_verification_status === "pending")).toBe(true);

    await admin.from("client_contacts").delete().in("id", [contactA!.id, contactB!.id]);
  });

  it("duplicate providerMessageId does not run the completion RPC a second time", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];
    const envelope = pairEnvelope(address, code);

    const first = await postInbound(envelope);
    expect(first.body.result).toBe("processed");
    expect(first.body.reply!.safeReplyCode).toBe("paired");

    // Re-deliver the EXACT same envelope (same providerMessageId) — as a
    // real webhook retry would.
    const second = await postInbound(envelope);
    expect(second.status).toBe(200);
    expect(second.body.result).toBe("duplicate");
    expect(second.body.reply!.safeReplyCode).toBe("duplicate");

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("verified");

    await ownerAClient.rpc("assistant_revoke_pairing", { p_identity_id: identityId });
  });

  it("STOP: an invalid HMAC signature is rejected with 401 before any DB mutation happens", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];

    const { status } = await postInbound(pairEnvelope(address, code), {
      signatureHeader: "0".repeat(64),
    });
    expect(status).toBe(401);

    const { data: beforeRetry } = await admin
      .from("assistant_channel_identities")
      .select("status, challenge_attempt_count")
      .eq("id", identityId)
      .single();
    expect(beforeRetry!.status).toBe("pending");
    expect(beforeRetry!.challenge_attempt_count).toBe(0);

    // The SAME correct code still completes afterward — proving the
    // invalid-signature attempt never touched the challenge at all.
    const retry = await postInbound(pairEnvelope(address, code));
    expect(retry.body.reply!.safeReplyCode).toBe("paired");

    await ownerAClient.rpc("assistant_revoke_pairing", { p_identity_id: identityId });
  });

  it("an unsupported message is ignored and never calls identity completion", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId } = issued![0];

    const { status, body } = await postInbound({
      provider: "fonnte",
      providerMessageId: `wamid.${crypto.randomUUID()}`,
      channel: "whatsapp",
      senderAddress: address,
      messageText: "halo, apa kabar?",
      providerTimestamp: String(Math.floor(Date.now() / 1000)),
    });

    expect(status).toBe(200);
    expect(body.reply!.safeReplyCode).toBe("ignored_unsupported_command");
    expect(body.reply!.replyRequired).toBe(false);

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status, challenge_attempt_count")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("pending");
    expect(row!.challenge_attempt_count).toBe(0);
  });

  it("concurrent duplicate delivery of the same message resolves to exactly one processed outcome", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const address = randomFakeE164();
    const { data: issued } = await ownerAClient.rpc("assistant_issue_pairing_challenge", {
      p_tenant_id: TENANT_A_ID,
      p_channel: "whatsapp",
      p_normalized_address: address,
    });
    const { identity_id: identityId, challenge_code: code } = issued![0];
    const envelope = pairEnvelope(address, code);

    const [a, b] = await Promise.all([postInbound(envelope), postInbound(envelope)]);

    const results = [a.body.result, b.body.result].sort();
    expect(results).toEqual(["duplicate", "processed"]);

    const { data: row } = await admin
      .from("assistant_channel_identities")
      .select("status")
      .eq("id", identityId)
      .single();
    expect(row!.status).toBe("verified");
  });
});
