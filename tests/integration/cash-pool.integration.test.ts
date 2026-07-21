import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the cash-pool repository/service
// layer uses (real authenticated HTTP requests, not mocks), same split as
// vessel-project-lifecycle.integration.test.ts from Gate 1B.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "cash-pool.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

// cash_pools carries a database-level UNIQUE(tenant_id, business_date) and,
// by design, can never be deleted (its append-only trigger blocks DELETE
// unconditionally — even for service_role, matching the "no hard delete"
// ledger-header invariant). A fixed business_date would collide with rows
// left behind by a previous run of this same suite, so every test that
// creates a pool uses a fresh, randomized business_date instead of trying
// (and failing) to clean pools up in afterAll.
function randomBusinessDate(): string {
  const base = Date.UTC(2031, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("shared daily cash pool — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "cp-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "cp-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "cp-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "cp-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "cp-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);
  });

  afterAll(async () => {
    // cash_pools/cash_pool_entries are permanently append-only (no DELETE
    // path exists for anyone, by design — see randomBusinessDate() above),
    // so there is nothing to clean up there. Only the ephemeral auth users
    // are removable.
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("creates a pool with no vessel/project reference — one pool per tenant/business_date", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();

    const { data: created, error } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    expect(error).toBeNull();
    expect(created?.tenant_id).toBe(TENANT_A_ID);
    expect(created?.business_date).toBe(businessDate);
    expect(created).not.toHaveProperty("vessel_id");
    expect(created).not.toHaveProperty("vessel_project_id");

    // The column genuinely does not exist on the table — not just absent
    // from the RPC's return shape.
    const { error: columnError } = await ownerAClient.from("cash_pools").select("vessel_id").limit(1);
    expect(columnError).not.toBeNull();

    const { count } = await admin
      .from("cash_pools")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate);
    expect(count).toBe(1);
  });

  it("get_or_create is idempotent — repeated calls return the same pool, never a duplicate", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();

    const first = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    const second = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    // Admin A is a different member of the same tenant — still resolves to
    // the same pool, not a new one.
    const adminAClient = await signInAsMember(adminA.email);
    const third = await adminAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data.id).toBe(first.data.id);
    expect(third.error).toBeNull();
    expect(third.data.id).toBe(first.data.id);

    const { count } = await admin
      .from("cash_pools")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate);
    expect(count).toBe(1);
  });

  it("concurrent create for the same tenant/business_date never produces two pools", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ownerAClient.rpc("get_or_create_daily_cash_pool", {
          p_tenant_id: TENANT_A_ID,
          p_business_date: businessDate,
        }),
      ),
    );

    for (const result of results) {
      expect(result.error).toBeNull();
    }
    const ids = new Set(results.map((r) => r.data.id));
    expect(ids.size).toBe(1);

    const { count } = await admin
      .from("cash_pools")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate);
    expect(count).toBe(1);
  });

  // Regression for the post-b9d79e6 corrective audit: the actual failure
  // mode 20260721020000_opening_cash_pool_atomic_guard.sql guards against is
  // a genuine concurrent/duplicate submission race (e.g. a double-click or
  // two browser tabs both firing record_cash_pool_entry(..., 'opening_cash',
  // ...) for the same pool at nearly the same instant) — never an
  // auto-post triggered by rendering, an effect, a loader, navigation, or
  // stale form state. Both CashEntryForm.tsx and OpenCashSection.tsx have
  // always required an explicit "Simpan"/"Konfirmasi & Posting" click at
  // every point in this codebase's history (confirmed back to 5f48996's
  // original CashEntryForm) — there is no code path that posts without one.
  // cash_pool_opening_cash_guard.test.sql (pgTAP) already proves the second
  // of two *sequential* calls is rejected; this proves it under real
  // concurrent load against local Supabase, exactly like the
  // "concurrent create" test above proves get_or_create_daily_cash_pool.
  it("concurrent opening_cash submissions for the same pool: exactly one posts, the rest are rejected — proves the real race the atomic guard closes", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();

    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        ownerAClient.rpc("record_cash_pool_entry", {
          p_pool_id: pool.id,
          p_entry_type: "opening_cash",
          p_amount: 1_000_000 + index,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.error === null);
    const failed = results.filter((r) => r.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(7);
    for (const result of failed) {
      expect(result.error!.message).toContain("opening cash already posted for this pool");
    }

    const { count } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id)
      .eq("entry_type", "opening_cash");
    expect(count).toBe(1);

    const { data: poolAfter } = await admin.from("cash_pools").select("opening_cash_posted").eq("id", pool.id).single();
    expect(poolAfter!.opening_cash_posted).toBe(true);
  });

  it("reviewer and viewer cannot create a pool; a forged/foreign tenant_id is rejected", async () => {
    const businessDate = randomBusinessDate();

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerError } = await reviewerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    expect(reviewerError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerError } = await viewerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    expect(viewerError).not.toBeNull();

    // Owner A is not a member of Tenant B at all — the role check must
    // reject this regardless of what tenant_id the caller sends.
    const ownerAClient = await signInAsMember(ownerA.email);
    const { error: forgedTenantError } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_B_ID,
      p_business_date: businessDate,
    });
    expect(forgedTenantError).not.toBeNull();

    const { count } = await admin
      .from("cash_pools")
      .select("id", { count: "exact", head: true })
      .eq("business_date", businessDate);
    expect(count).toBe(0);
  });

  it("recording opening_cash/cash_top_up/other_cash_in produces a server-computed summary matching the canonical formula", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();

    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    const { data: opening, error: openingError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "opening_cash",
      p_amount: 50_000_000,
      p_description: "saldo awal hari",
    });
    expect(openingError).toBeNull();
    expect(opening.created_by).toBe(ownerA.id);
    expect(opening.entry_kind).toBe("entry");

    const { error: topUpError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "cash_top_up",
      p_amount: 10_000_000,
    });
    expect(topUpError).toBeNull();

    const { error: otherInError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "other_cash_in",
      p_amount: 1_500_000.5,
    });
    expect(otherInError).toBeNull();

    const { data: summary, error: summaryError } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("*")
      .eq("pool_id", pool.id)
      .single();
    expect(summaryError).toBeNull();
    expect(summary.opening_cash).toBe(50_000_000);
    expect(summary.cash_top_up).toBe(10_000_000);
    expect(summary.other_cash_in).toBe(1_500_000.5);
    // Explicit integration boundary — no trusted cost/expense ledger exists
    // yet at this gate, so this must be exactly 0, never fabricated.
    expect(summary.total_cash_out).toBe(0);
    expect(summary.closing_cash).toBe(61_500_000.5);
  });

  it("a client cannot send or alter the aggregate/closing balance directly", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    // No RPC accepts a closing/aggregate value, and the view itself is not
    // a writable target (no INSERT/UPDATE grant, and it is a plain
    // aggregating view with no INSTEAD OF trigger).
    const { error: viewInsertError } = await ownerAClient
      .from("cash_pool_daily_summary")
      .insert({ pool_id: pool.id, closing_cash: 999_999_999 } as never);
    expect(viewInsertError).not.toBeNull();

    const { data: summary } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("*")
      .eq("pool_id", pool.id)
      .single();
    expect(summary.closing_cash).toBe(0);
  });

  it("reversal points to the original entry, excludes it from the summary, and cannot be repeated", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    // entryA is the pool's one-and-only opening_cash entry (Gate 1's atomic
    // duplicate guard now rejects a second opening_cash entry per pool — see
    // 20260721020000_opening_cash_pool_atomic_guard.sql) — a cash_top_up
    // entry is used alongside it purely so the summary has two independent,
    // non-zero components to distinguish "reversed and excluded" from "the
    // whole summary went to zero".
    const { data: entryA } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "opening_cash",
      p_amount: 1_000_000,
    });
    await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "cash_top_up",
      p_amount: 2_000_000,
    });

    const { data: summaryBefore } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("opening_cash, cash_top_up")
      .eq("pool_id", pool.id)
      .single();
    expect(summaryBefore!.opening_cash).toBe(1_000_000);
    expect(summaryBefore!.cash_top_up).toBe(2_000_000);

    const { data: reversal, error: reversalError } = await ownerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: entryA.id,
      p_reason: "salah input nominal saldo awal",
    });
    expect(reversalError).toBeNull();
    expect(reversal.entry_kind).toBe("reversal");
    expect(reversal.reverses_entry_id).toBe(entryA.id);
    expect(reversal.entry_type).toBe("opening_cash");
    expect(reversal.amount).toBe(entryA.amount);

    const { data: summaryAfter } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("opening_cash, cash_top_up")
      .eq("pool_id", pool.id)
      .single();
    expect(summaryAfter!.opening_cash).toBe(0);
    expect(summaryAfter!.cash_top_up).toBe(2_000_000);

    // Double reversal is rejected.
    const { error: doubleReversalError } = await ownerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: entryA.id,
      p_reason: "coba lagi",
    });
    expect(doubleReversalError).not.toBeNull();

    // A reversal row itself cannot be reversed.
    const { error: reverseReversalError } = await ownerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: reversal.id,
      p_reason: "coba reverse hasil reversal",
    });
    expect(reverseReversalError).not.toBeNull();

    // Original entry row is untouched — reversal is a new row, not an edit.
    const { data: originalStillThere } = await admin
      .from("cash_pool_entries")
      .select("id, entry_kind, amount")
      .eq("id", entryA.id)
      .single();
    expect(originalStillThere?.entry_kind).toBe("entry");
    expect(originalStillThere?.amount).toBe(entryA.amount);

    const { data: entries } = await ownerAClient
      .from("cash_pool_entries")
      .select("id")
      .eq("pool_id", pool.id);
    expect(entries).toHaveLength(3); // entryA, entryB, reversal — nothing deleted, nothing overwritten
  });

  it("a reversal reason is required, and amount must be greater than zero", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    const { error: zeroAmountError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "cash_top_up",
      p_amount: 0,
    });
    expect(zeroAmountError).not.toBeNull();

    const { error: negativeAmountError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "cash_top_up",
      p_amount: -500,
    });
    expect(negativeAmountError).not.toBeNull();

    const { data: entry } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "cash_top_up",
      p_amount: 500,
    });

    const { error: emptyReasonError } = await ownerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: entry.id,
      p_reason: "",
    });
    expect(emptyReasonError).not.toBeNull();
  });

  it("reviewer and viewer cannot record or reverse entries", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    const { data: entry } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "other_cash_in",
      p_amount: 100_000,
    });

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerRecordError } = await reviewerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "other_cash_in",
      p_amount: 100_000,
    });
    expect(reviewerRecordError).not.toBeNull();
    const { error: reviewerReverseError } = await reviewerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: entry.id,
      p_reason: "reviewer mencoba reverse",
    });
    expect(reviewerReverseError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerRecordError } = await viewerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "other_cash_in",
      p_amount: 100_000,
    });
    expect(viewerRecordError).not.toBeNull();
  });

  it("cash_pools and cash_pool_entries reject direct authenticated mutation — RPC is the only write path", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    const { data: entry } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "opening_cash",
      p_amount: 1_000,
    });

    const { error: poolInsertError } = await ownerAClient
      .from("cash_pools")
      .insert({ tenant_id: TENANT_A_ID, business_date: randomBusinessDate(), created_by: ownerA.id });
    expect(poolInsertError).not.toBeNull();

    const { error: poolUpdateError } = await ownerAClient
      .from("cash_pools")
      .update({ business_date: randomBusinessDate() })
      .eq("id", pool.id);
    expect(poolUpdateError).not.toBeNull();

    const { error: poolDeleteError } = await ownerAClient.from("cash_pools").delete().eq("id", pool.id);
    expect(poolDeleteError).not.toBeNull();

    const { error: entryInsertError } = await ownerAClient.from("cash_pool_entries").insert({
      tenant_id: TENANT_A_ID,
      pool_id: pool.id,
      entry_type: "opening_cash",
      amount: 999_999,
      created_by: ownerA.id,
    });
    expect(entryInsertError).not.toBeNull();

    const { error: entryUpdateError } = await ownerAClient
      .from("cash_pool_entries")
      .update({ amount: 1 })
      .eq("id", entry.id);
    expect(entryUpdateError).not.toBeNull();

    const { error: entryDeleteError } = await ownerAClient.from("cash_pool_entries").delete().eq("id", entry.id);
    expect(entryDeleteError).not.toBeNull();

    // Nothing changed despite the attempts above.
    const { data: entryAfter } = await admin.from("cash_pool_entries").select("amount").eq("id", entry.id).single();
    expect(entryAfter?.amount).toBe(1000);
  });

  it("Tenant A and Tenant B each get their own separate pool on the same business_date, fully isolated", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);
    const businessDate = randomBusinessDate();

    const { data: poolA } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    const { data: poolB } = await ownerBClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_B_ID,
      p_business_date: businessDate,
    });
    expect(poolA.id).not.toBe(poolB.id);

    const { data: seenByA } = await ownerAClient.from("cash_pools").select("id").eq("id", poolB.id);
    expect(seenByA).toHaveLength(0);

    const { data: entryB } = await ownerBClient.rpc("record_cash_pool_entry", {
      p_pool_id: poolB.id,
      p_entry_type: "opening_cash",
      p_amount: 7_000_000,
    });

    // Owner A cannot read, record against, or reverse Tenant B's pool/entry.
    const { error: crossRecordError } = await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: poolB.id,
      p_entry_type: "opening_cash",
      p_amount: 1,
    });
    expect(crossRecordError).not.toBeNull();

    const { error: crossReverseError } = await ownerAClient.rpc("reverse_cash_pool_entry", {
      p_entry_id: entryB.id,
      p_reason: "lintas tenant",
    });
    expect(crossReverseError).not.toBeNull();

    const { data: summaryA } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("opening_cash")
      .eq("pool_id", poolA.id)
      .single();
    expect(summaryA!.opening_cash).toBe(0);
  });

  it("anonymous requests get zero access to cash_pools, cash_pool_entries, and the summary view", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: pools, error: poolsError } = await anonClient.from("cash_pools").select("id");
    expect(poolsError).not.toBeNull();
    expect(pools).toBeNull();

    const { data: entries, error: entriesError } = await anonClient.from("cash_pool_entries").select("id");
    expect(entriesError).not.toBeNull();
    expect(entries).toBeNull();

    const { data: summary, error: summaryError } = await anonClient.from("cash_pool_daily_summary").select("*");
    expect(summaryError).not.toBeNull();
    expect(summary).toBeNull();

    const { error: rpcError } = await anonClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: randomBusinessDate(),
    });
    expect(rpcError).not.toBeNull();
  });
});
