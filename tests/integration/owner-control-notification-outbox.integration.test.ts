import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// what genuinely needs a real HTTP round trip and true concurrency for
// Gate 1L's notification outbox (claim_next_notification_event /
// complete_notification_event / fail_notification_event,
// 20260721000000_owner_control_notification_outbox.sql). Every deterministic
// business rule (exactly-once enqueue, retry non-duplication, bounded retry,
// claim-ownership enforcement, append-only, grants) already has an
// exhaustive, sequential proof in
// supabase/tests/database/owner_control_notification_outbox.test.sql — this
// file only proves what a single pgTAP connection cannot: two workers
// racing the SAME claim call never win the same row, and that `authenticated`
// (a real signed-in tenant member, not just a grant-table check) genuinely
// cannot reach these RPCs at all.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "owner-control-notification-outbox.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";

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

function randomBusinessDate(): string {
  // Mirrors owner-approved-cash-import-commit.integration.test.ts's own
  // randomBusinessDate() — sibling integration files run in parallel
  // against the same local Supabase instance, and a collision on
  // tenant+business_date would be a false OPENING_BALANCE_CONFLICT failure,
  // not a real bug.
  const base = Date.UTC(2032, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// One opening row + one cash top-up row — the minimum shape that reaches
// ready_for_review (no vessel/project fixture needed at all, since 'cash'
// mapping never references one).
function buildMinimalRowsFixture() {
  return [
    {
      source_row_number: 2,
      source_fingerprint: `oc-notif-open-${crypto.randomUUID()}`,
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
      source_fingerprint: `oc-notif-kas-${crypto.randomUUID()}`,
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

describe("owner control notification outbox — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "ocno-owner-a", role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "ocno-admin-a", role: "admin" });
    createdUserIds.push(adminA.id);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  // The outbox is a real, persisted, GLOBAL queue shared by every
  // integration test file that touches cash-import-staging (mark-ready and
  // approve both enqueue a notification as a side effect) — unlike the
  // pgTAP suite, nothing here rolls back. Older leftover pending/reclaimable
  // rows from sibling files would otherwise sit ahead of ours in FIFO order
  // and make "claim N times, expect to see our row" nondeterministic. Drain
  // everything claimable into 'processing' with a long lease first, so our
  // own row is provably the only pending one when the real test runs.
  async function drainOutboxBacklog(): Promise<void> {
    for (let i = 0; i < 500; i++) {
      const { data, error } = await admin.rpc("claim_next_notification_event", {
        p_worker_id: `drain-${crypto.randomUUID()}`,
        p_lease_seconds: 3600,
      });
      expect(error).toBeNull();
      // PostgREST serializes a NULL composite (nothing left to claim) as an
      // object with every field null, not a bare JSON null — see
      // src/lib/notification-outbox/repository.test.ts for the same fix
      // applied to the actual application code.
      if (!data?.id) {
        return;
      }
    }
    throw new Error("drainOutboxBacklog did not converge — outbox backlog is unexpectedly large");
  }

  async function stageReadyBatch(): Promise<string> {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error: createError } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-notif-outbox.xlsx",
      p_source_sha256: `sha-notif-outbox-${crypto.randomUUID()}`,
      p_source_sheet_name: "Sheet1",
      p_business_date: randomBusinessDate(),
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_500_000,
      p_rows: buildMinimalRowsFixture(),
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

  it("submitting a batch for review enqueues a notification that two concurrent workers can never both claim", async () => {
    await drainOutboxBacklog();
    const batchId = await stageReadyBatch();

    // Five parallel claim attempts. The drain above means our freshly
    // enqueued notification is provably the only pending row left in the
    // whole outbox at this point (sibling files may still be enqueueing
    // concurrently — this only guarantees ours is claimable, not that
    // nothing else ever becomes claimable mid-race) — regardless of what
    // else races in, our own row must be claimed by EXACTLY ONE of the 5
    // attempts, and FOR UPDATE SKIP LOCKED must never hand the identical
    // row to two callers at once.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        admin.rpc("claim_next_notification_event", { p_worker_id: `race-worker-${i}`, p_lease_seconds: 60 }),
      ),
    );

    for (const attempt of attempts) {
      expect(attempt.error).toBeNull();
    }

    // Same all-null-composite caveat as drainOutboxBacklog above.
    const claimedRows = attempts.map((a) => a.data).filter((row) => row?.id != null);
    const claimedIds = claimedRows.map((row) => row.id as string);
    expect(new Set(claimedIds).size).toBe(claimedIds.length); // no row claimed twice

    const ours = claimedRows.filter((row) => row.subject_id === batchId);
    expect(ours).toHaveLength(1);
    expect(ours[0].event_type).toBe("import_review_requested");
    expect(ours[0].status).toBe("processing");

    // Close the loop: the worker that won our row can complete it.
    const winnerWorkerId = claimedRows.find((row) => row.subject_id === batchId)
      ? attempts.findIndex((a) => a.data?.subject_id === batchId)
      : -1;
    expect(winnerWorkerId).toBeGreaterThanOrEqual(0);

    const { data: completed, error: completeError } = await admin.rpc("complete_notification_event", {
      p_event_id: ours[0].id,
      p_worker_id: `race-worker-${winnerWorkerId}`,
      p_provider_message_id: "integration-test-msg-id",
    });
    expect(completeError).toBeNull();
    expect(completed.status).toBe("sent");
  });

  it("a real signed-in tenant member (owner or admin) cannot call the outbox RPCs directly — service_role only", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { error: ownerError } = await ownerAClient.rpc("claim_next_notification_event", {
      p_worker_id: "should-not-work",
      p_lease_seconds: 60,
    });
    expect(ownerError).not.toBeNull();

    const adminAClient = await signInAsMember(adminA.email);
    const { error: adminError } = await adminAClient.rpc("claim_next_notification_event", {
      p_worker_id: "should-not-work-either",
      p_lease_seconds: 60,
    });
    expect(adminError).not.toBeNull();
  });
});
