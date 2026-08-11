import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Phase 3 — LOCAL WHATSAPP E2E EVIDENCE CLOSEOUT (Gap B from the Phase 3
// audit). This is the one existing chain a live n8n delivery actually
// exercises, driven end-to-end through the REAL Next.js route handlers
// (same "invoke the route function directly, no HTTP server needed"
// harness as assistant-inbound.integration.test.ts / morning-brief.
// integration.test.ts):
//
//   mark_cash_import_batch_ready_for_review (real RPC, real domain event)
//     -> notification_events row enqueued (private.enqueue_notification_event)
//     -> POST /api/internal/notifications/claim   (real route, real service, real RPC)
//     -> "Send via Fonnte" HTTP call — REPLACED with a plain node:http
//        server bound to 127.0.0.1 on an OS-assigned ephemeral port. This
//        is the ONLY thing this file fakes; every ADOP-owned step above and
//        below it is the genuine production code path.
//     -> POST /api/internal/notifications/complete or /fail (real route)
//     -> canonical notification_events.status
//
// No Fonnte credential, real WhatsApp number, or hosted n8n instance is
// referenced anywhere in this file — grep confirms no `FONNTE`/`fonnte.com`
// string appears below. The single outbound "send" in every test is a
// real Node `fetch()` call, but its target is always the loopback mock
// server started in beforeAll, never any external host.
//
// pgTAP (owner_control_notification_outbox.test.sql) remains the
// exhaustive, sequential proof of the state machine itself (exactly-once
// enqueue, bounded retry, append-only, grants). owner-control-notification-
// outbox.integration.test.ts remains the proof that two concurrent workers
// can never win the same claim. This file does not re-derive either —
// it proves the one thing neither of those does: the full chain strung
// together through the actual HTTP route boundary a live delivery worker
// calls, including a scripted provider failure and recovery.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !INTERNAL_SECRET) {
  throw new Error(
    "owner-control-whatsapp-e2e.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and INTERNAL_API_SECRET in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";

// A deliberately fake, locally-defined recipient — never read from any env
// var, never a real phone number. Mirrors the `target` field
// owner-control-whatsapp-notification.json's Fonnte node sends, without
// ever touching RECIPIENT_OWNER_WHATSAPP_NUMBER.
const FAKE_TEST_RECIPIENT = "62800000000";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, {
    emailPrefix: params.emailPrefix,
    memberships: [{ tenantId: TENANT_A_ID, role: params.role }],
  });
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

async function importNotificationRoutes(): Promise<{
  claim: typeof import("@/app/api/internal/notifications/claim/route");
  complete: typeof import("@/app/api/internal/notifications/complete/route");
  fail: typeof import("@/app/api/internal/notifications/fail/route");
}> {
  const [claim, complete, fail] = await Promise.all([
    import("@/app/api/internal/notifications/claim/route"),
    import("@/app/api/internal/notifications/complete/route"),
    import("@/app/api/internal/notifications/fail/route"),
  ]);
  return { claim, complete, fail };
}

function buildInternalRequest(
  path: string,
  body: unknown,
  opts: { headers?: Record<string, string>; withSecret?: boolean } = {},
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.withSecret !== false && !headers["x-internal-secret"]) {
    headers["x-internal-secret"] = INTERNAL_SECRET!;
  }
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

interface ClaimResponseBody {
  event: { id: string; message: string; recipient: string } | null;
}
interface StatusResponseBody {
  status?: string;
  error?: string;
}

async function callClaim(
  routes: Awaited<ReturnType<typeof importNotificationRoutes>>,
  workerId: string,
  leaseSeconds = 60,
): Promise<{ httpStatus: number; body: ClaimResponseBody }> {
  const response = await routes.claim.POST(
    buildInternalRequest("/api/internal/notifications/claim", { workerId, leaseSeconds }),
  );
  return { httpStatus: response.status, body: (await response.json()) as ClaimResponseBody };
}

async function callComplete(
  routes: Awaited<ReturnType<typeof importNotificationRoutes>>,
  id: string,
  workerId: string,
  providerMessageId?: string,
): Promise<{ httpStatus: number; body: StatusResponseBody }> {
  const response = await routes.complete.POST(
    buildInternalRequest("/api/internal/notifications/complete", { id, workerId, providerMessageId }),
  );
  return { httpStatus: response.status, body: (await response.json()) as StatusResponseBody };
}

async function callFail(
  routes: Awaited<ReturnType<typeof importNotificationRoutes>>,
  id: string,
  workerId: string,
  errorMessage: string,
): Promise<{ httpStatus: number; body: StatusResponseBody }> {
  const response = await routes.fail.POST(
    buildInternalRequest("/api/internal/notifications/fail", { id, workerId, error: errorMessage }),
  );
  return { httpStatus: response.status, body: (await response.json()) as StatusResponseBody };
}

// Randomized synthetic numbers to avoid cross-test/cross-suite collisions in
// the shared local database (same reasoning as sibling integration files'
// own randomBusinessDate()/randomFakeE164()).
function randomBusinessDate(): string {
  const base = Date.UTC(2033, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// Same generator morning-brief.integration.test.ts / assistant-inbound.
// integration.test.ts already use for collision-free dummy WhatsApp numbers
// — local-only, never a real Founder/Pak Hanafi number.
function randomFakeE164(): string {
  const suffix = Math.floor(1_000_000 + Math.random() * 8_999_999);
  return `+62809${suffix}`;
}

// Gate 1L-R2 (src/lib/notification-outbox/service.ts's
// claimNextNotificationForDelivery) now resolves the claim's recipient via
// resolve_verified_owner_recipient before returning a claimed event, which
// requires exactly one verified WhatsApp identity bound to an active owner
// membership — a plain "owner" membership (what createEphemeralMember above
// already grants ownerA) is no longer sufficient on its own. Pairs through
// the same real, service-role-gated RPCs morning-brief.integration.test.ts
// uses (assistant_issue_pairing_challenge / assistant_complete_pairing) —
// never a raw insert into assistant_channel_identities.
async function pairOwnerWhatsAppRecipient(owner: EphemeralMember, tenantId: string): Promise<string> {
  const ownerClient = await signInAsMember(owner.email);
  const address = randomFakeE164();
  const { data: issued, error: issueError } = await ownerClient.rpc("assistant_issue_pairing_challenge", {
    p_tenant_id: tenantId,
    p_channel: "whatsapp",
    p_normalized_address: address,
  });
  if (issueError || !issued?.[0]) {
    throw new Error(`assistant_issue_pairing_challenge failed: ${issueError?.message}`);
  }
  const { error: completeError } = await admin.rpc("assistant_complete_pairing", {
    p_channel: "whatsapp",
    p_normalized_address: address,
    p_code: issued[0].challenge_code,
  });
  if (completeError) {
    throw new Error(`assistant_complete_pairing failed: ${completeError.message}`);
  }
  return address;
}

// One opening row + one cash top-up row — the minimum shape that reaches
// ready_for_review (no vessel/project fixture needed, since 'cash' mapping
// never references one). Amount values below are asserted to NEVER appear
// in the composed WhatsApp message (see the message-safety assertions).
function buildMinimalRowsFixture(labelPrefix: string) {
  return [
    {
      source_row_number: 2,
      source_fingerprint: `wa-e2e-${labelPrefix}-open-${crypto.randomUUID()}`,
      description: null,
      vessel_label: null,
      debit: null,
      credit: null,
      workbook_balance: 1_000_000,
      calculated_balance: 1_000_000,
      provisional_classification: "opening_cash",
      status: "valid",
      validation_issues: [],
    },
    {
      source_row_number: 3,
      source_fingerprint: `wa-e2e-${labelPrefix}-kas-${crypto.randomUUID()}`,
      description: "setor kas",
      vessel_label: "Kas",
      debit: 500_000,
      credit: null,
      workbook_balance: 1_500_000,
      calculated_balance: 1_500_000,
      provisional_classification: "cash_top_up_candidate",
      status: "valid",
      validation_issues: [],
    },
  ];
}

describe("owner control -> WhatsApp notification delivery — full local E2E chain (mock Fonnte, no real send)", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  // Set in beforeAll, right after ownerA is created — every test in this
  // file needs a resolvable recipient (Gate 1L-R2).
  let ownerWhatsAppRecipient: string;

  // Local-only mock of Fonnte's HTTP send endpoint. Bound to 127.0.0.1 with
  // an OS-assigned port (never 0.0.0.0, never a fixed/well-known port) so
  // it can never be mistaken for, or reachable as, a real external service.
  let mockServer: Server;
  let mockUrl: string;
  let mockOutcome: "success" | "failure" = "success";
  let receivedCalls: Array<{ target: string; message: string }> = [];

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "wa-e2e-owner-a", role: "owner" });
    createdUserIds.push(ownerA.id);
    ownerWhatsAppRecipient = await pairOwnerWhatsAppRecipient(ownerA, TENANT_A_ID);
    adminA = await createEphemeralMember({ emailPrefix: "wa-e2e-admin-a", role: "admin" });
    createdUserIds.push(adminA.id);

    mockServer = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => {
        raw += chunk.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(raw) as { target: string; message: string };
        receivedCalls.push(parsed);
        res.setHeader("content-type", "application/json");
        if (mockOutcome === "success") {
          res.writeHead(200);
          res.end(JSON.stringify({ status: true, id: [`mock-fonnte-${crypto.randomUUID()}`] }));
        } else {
          res.writeHead(502);
          res.end(JSON.stringify({ status: false, reason: "mock provider forced failure (test-scripted)" }));
        }
      });
    });
    await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
    const address = mockServer.address() as AddressInfo;
    mockUrl = `http://127.0.0.1:${address.port}/send`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  beforeEach(() => {
    mockOutcome = "success";
    receivedCalls = [];
  });

  // Same reasoning as owner-control-notification-outbox.integration.test.ts's
  // own drainOutboxBacklog(): the outbox is a real, persisted, GLOBAL queue
  // shared by every integration file that touches cash-import-staging.
  // Draining first makes "claim and expect to see our own row" deterministic.
  async function drainOutboxBacklog(): Promise<void> {
    for (let i = 0; i < 500; i++) {
      const { data, error } = await admin.rpc("claim_next_notification_event", {
        p_worker_id: `wa-e2e-drain-${crypto.randomUUID()}`,
        p_lease_seconds: 3600,
      });
      expect(error).toBeNull();
      if (!data?.id) {
        return;
      }
    }
    throw new Error("drainOutboxBacklog did not converge — outbox backlog is unexpectedly large");
  }

  async function stageReadyBatch(labelPrefix: string): Promise<string> {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error: createError } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: `laporan-wa-e2e-${labelPrefix}.xlsx`,
      p_source_sha256: `sha-wa-e2e-${labelPrefix}-${crypto.randomUUID()}`,
      p_source_sheet_name: "Sheet1",
      p_business_date: randomBusinessDate(),
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_500_000,
      p_rows: buildMinimalRowsFixture(labelPrefix),
    });
    expect(createError).toBeNull();
    const batchId = created.batch.id as string;

    const { error: mapError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "Kas",
      p_mapping_kind: "cash",
    });
    expect(mapError).toBeNull();

    const { data: rows } = await adminAClient
      .from("cash_import_rows")
      .select("id")
      .eq("batch_id", batchId)
      .eq("vessel_label", "Kas");
    const { error: dispositionError } = await adminAClient.rpc("set_cash_import_row_disposition", {
      p_row_id: rows![0].id,
      p_disposition: "include",
    });
    expect(dispositionError).toBeNull();

    const { error: readyError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(readyError).toBeNull();

    return batchId;
  }

  async function sendViaMockFonnte(message: string): Promise<{ ok: boolean; providerMessageId?: string }> {
    // Mirrors owner-control-whatsapp-notification.json's "Send via Fonnte"
    // node body shape ({ target, message }) — the only substitution is the
    // URL, which always points at the loopback mock started in beforeAll.
    const response = await fetch(mockUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: FAKE_TEST_RECIPIENT, message }),
    });
    const body = (await response.json()) as { status: boolean; id?: string[] };
    return { ok: response.ok, providerMessageId: body.id?.[0] };
  }

  it("happy path: enqueue -> claim -> mock provider accepts -> complete -> sent; the sent event cannot be reclaimed", async () => {
    const routes = await importNotificationRoutes();
    await drainOutboxBacklog();
    await stageReadyBatch("happy");

    const workerId = `wa-e2e-happy-${crypto.randomUUID()}`;
    const claimed = await callClaim(routes, workerId);
    expect(claimed.httpStatus).toBe(200);
    expect(claimed.body.event).not.toBeNull();
    expect(claimed.body.event!.recipient).toBe(ownerWhatsAppRecipient);
    const { id: eventId, message } = claimed.body.event!;

    // --- message safety: minimum data only, no raw amounts, no secrets ---
    expect(message).not.toMatch(/1[.,]?000[.,]?000/);
    expect(message).not.toMatch(/1[.,]?500[.,]?000/);
    expect(message).not.toMatch(/500[.,]?000/);
    expect(message).not.toContain(SERVICE_ROLE_KEY);
    expect(message).not.toContain(INTERNAL_SECRET);
    expect(message.length).toBeLessThan(400);

    const sendResult = await sendViaMockFonnte(message);
    expect(sendResult.ok).toBe(true);
    expect(receivedCalls).toHaveLength(1);
    expect(receivedCalls[0].message).toBe(message);
    expect(receivedCalls[0].target).toBe(FAKE_TEST_RECIPIENT);

    const completed = await callComplete(routes, eventId, workerId, sendResult.providerMessageId);
    expect(completed.httpStatus).toBe(200);
    expect(completed.body.status).toBe("sent");

    // A completed event must never be claimable again.
    const reclaim = await callClaim(routes, `${workerId}-reclaim`);
    expect(reclaim.httpStatus).toBe(200);
    expect(reclaim.body.event).toBeNull();

    // Replaying the complete callback (e.g. n8n retrying after a lost HTTP
    // response) must be rejected, never silently re-accepted or duplicated.
    const replay = await callComplete(routes, eventId, workerId);
    expect(replay.httpStatus).toBe(409);
    expect(replay.body.error).toBe("NOTIFICATION_CLAIM_MISMATCH");
  });

  it("failure path: bounded retry to terminal failure — pending x4 then failed at attempt 5, never claimed again", async () => {
    const routes = await importNotificationRoutes();
    await drainOutboxBacklog();
    await stageReadyBatch("fail-terminal");

    const workerIdBase = `wa-e2e-failterm-${crypto.randomUUID()}`;
    let eventId: string | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const workerId = `${workerIdBase}-${attempt}`;
      const claimed = await callClaim(routes, workerId);
      expect(claimed.httpStatus).toBe(200);
      expect(claimed.body.event).not.toBeNull();
      if (eventId) {
        // Every retry must reclaim the SAME row, not enqueue/pick a new one.
        expect(claimed.body.event!.id).toBe(eventId);
      }
      eventId = claimed.body.event!.id;

      mockOutcome = "failure";
      const sendResult = await sendViaMockFonnte(claimed.body.event!.message);
      expect(sendResult.ok).toBe(false);

      const failed = await callFail(routes, eventId, workerId, "mock provider returned non-2xx (test-scripted)");
      expect(failed.httpStatus).toBe(200);
      if (attempt < 5) {
        expect(failed.body.status).toBe("pending"); // eligible for retry
      } else {
        expect(failed.body.status).toBe("failed"); // terminal — max_attempts (5) reached
      }
    }

    const afterTerminal = await callClaim(routes, `${workerIdBase}-post-terminal`);
    expect(afterTerminal.httpStatus).toBe(200);
    expect(afterTerminal.body.event).toBeNull();
  });

  it("failure path: an event that failed once can still be retried and delivered successfully", async () => {
    const routes = await importNotificationRoutes();
    await drainOutboxBacklog();
    await stageReadyBatch("fail-then-recover");

    const worker1 = `wa-e2e-recover-1-${crypto.randomUUID()}`;
    const claim1 = await callClaim(routes, worker1);
    expect(claim1.body.event).not.toBeNull();
    const eventId = claim1.body.event!.id;

    mockOutcome = "failure";
    await sendViaMockFonnte(claim1.body.event!.message);
    const fail1 = await callFail(routes, eventId, worker1, "mock provider returned non-2xx (test-scripted)");
    expect(fail1.body.status).toBe("pending");

    const worker2 = `wa-e2e-recover-2-${crypto.randomUUID()}`;
    const claim2 = await callClaim(routes, worker2);
    expect(claim2.body.event).not.toBeNull();
    expect(claim2.body.event!.id).toBe(eventId); // same row, retried

    mockOutcome = "success";
    const send2 = await sendViaMockFonnte(claim2.body.event!.message);
    expect(send2.ok).toBe(true);
    const complete2 = await callComplete(routes, eventId, worker2, send2.providerMessageId);
    expect(complete2.httpStatus).toBe(200);
    expect(complete2.body.status).toBe("sent");
  });

  it("isolation & authorization: no route access without the shared internal secret; no signed-in tenant member of any role can reach the outbox directly", async () => {
    const routes = await importNotificationRoutes();

    const noSecret = await routes.claim.POST(
      buildInternalRequest("/api/internal/notifications/claim", { workerId: "wa-e2e-no-secret" }, { withSecret: false }),
    );
    expect(noSecret.status).toBe(401);

    const wrongSecret = await routes.claim.POST(
      buildInternalRequest(
        "/api/internal/notifications/claim",
        { workerId: "wa-e2e-wrong-secret" },
        { headers: { "x-internal-secret": "not-the-real-secret" } },
      ),
    );
    expect(wrongSecret.status).toBe(401);

    // claim_next_notification_event takes no tenant parameter at all and
    // the route never returns tenant_id/subject_id to its caller — isolation
    // here is enforced by "no signed-in tenant user, of any role, can call
    // this at all", not by a per-tenant filter. A real owner (the role that
    // legitimately acts on these notifications elsewhere in the app) must
    // still be rejected when calling the RPC directly.
    const ownerClient = await signInAsMember(ownerA.email);
    const { error: ownerRpcError } = await ownerClient.rpc("claim_next_notification_event", {
      p_worker_id: "wa-e2e-owner-should-not-work",
      p_lease_seconds: 60,
    });
    expect(ownerRpcError).not.toBeNull();

    const adminClient = await signInAsMember(adminA.email);
    const { error: adminRpcError } = await adminClient.rpc("claim_next_notification_event", {
      p_worker_id: "wa-e2e-admin-should-not-work",
      p_lease_seconds: 60,
    });
    expect(adminRpcError).not.toBeNull();

    // Unauthenticated (anon) access to the raw table is blocked by RLS
    // (revoke-all on the table itself) regardless of role.
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { data: anonRows } = await anonClient.from("notification_events").select("id").limit(1);
    expect(anonRows ?? []).toHaveLength(0);
  });

  it("replay/idempotency at the domain layer: re-submitting the same 'mark ready' action never enqueues a second notification", async () => {
    const routes = await importNotificationRoutes();
    await drainOutboxBacklog();
    const batchId = await stageReadyBatch("idempotent-enqueue");

    // Replaying the domain action that triggers the enqueue (e.g. a
    // double-submitted form, or a retried request) must be rejected by the
    // batch-status guard BEFORE it ever reaches the enqueue call — this is
    // what actually prevents a duplicate notification, not a race on the
    // enqueue call itself (that dedup path is pgTAP's job).
    const adminAClient = await signInAsMember(adminA.email);
    const { error: secondMarkError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(secondMarkError).not.toBeNull();
    expect(secondMarkError?.message).toContain("BATCH_NOT_ELIGIBLE_FOR_REVIEW");

    // Exactly one claimable notification exists for this batch.
    const claimed = await callClaim(routes, `wa-e2e-idempotent-${crypto.randomUUID()}`);
    expect(claimed.body.event).not.toBeNull();

    const nothingElse = await callClaim(routes, `wa-e2e-idempotent-followup-${crypto.randomUUID()}`);
    expect(nothingElse.body.event).toBeNull();
  });
});
