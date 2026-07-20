import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the cash-import-staging
// repository/service layer uses for Gate 1J-D's append-only rollback
// (rollback_cash_import_batch, 20260720130000_append_only_cash_import_
// rollback.sql). This file focuses on what genuinely needs a real HTTP round
// trip and true concurrency — every business-rule invariant (reversal
// shape, accounting-effect baseline, atomicity on a mid-loop failure,
// provenance completeness, safety guards) already has an exhaustive,
// deterministic proof in
// supabase/tests/database/append_only_cash_import_rollback.test.sql.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "append-only-cash-import-rollback.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local — run `pnpm supabase:start` first.",
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

function randomSha(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Mirrors owner-approved-cash-import-commit.integration.test.ts's own
// randomBusinessDate() — sibling integration files run in parallel against
// the same local Supabase instance, and OPENING_BALANCE_CONFLICT means a
// tenant+business_date collision would be a false failure, not a real bug.
function randomBusinessDate(): string {
  const base = Date.UTC(2032, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// One opening row + one cash top-up + one project expense + one shared
// overhead + one project refund — the full canonical posting shape, so
// rollback has all five reversal kinds to exercise.
function buildFullRowsFixture() {
  return [
    {
      source_row_number: 2,
      source_fingerprint: `fp-open-${crypto.randomUUID()}`,
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
      source_fingerprint: `fp-kas-${crypto.randomUUID()}`,
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
    {
      source_row_number: 4,
      source_fingerprint: `fp-expense-${crypto.randomUUID()}`,
      description: "beli spare part",
      vessel_label: "KM Anchor",
      debit: null,
      credit: 200_000,
      workbook_balance: 1_300_000,
      calculated_balance: 1_300_000,
      provisional_classification: "project_expense_candidate",
      status: "valid",
      validation_issues: [],
    },
    {
      source_row_number: 5,
      source_fingerprint: `fp-overhead-${crypto.randomUUID()}`,
      description: "listrik kantor",
      vessel_label: "Lain-lain",
      debit: null,
      credit: 80_000,
      workbook_balance: 1_220_000,
      calculated_balance: 1_220_000,
      provisional_classification: "unallocated_expense_review",
      status: "valid",
      validation_issues: [],
    },
    {
      source_row_number: 6,
      source_fingerprint: `fp-refund-${crypto.randomUUID()}`,
      description: "pengembalian sisa material",
      vessel_label: "KM Anchor",
      debit: 50_000,
      credit: null,
      workbook_balance: 1_270_000,
      calculated_balance: 1_270_000,
      provisional_classification: "project_cash_in_or_refund_review",
      status: "valid",
      validation_issues: [],
    },
  ];
}

describe("append-only cash import rollback — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let projectAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "aacir-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "aacir-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "aacir-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "aacir-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "AACIR Anchor Client A" })
      .select("id")
      .single();
    createdClientIds.push(clientA!.id);

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientA!.id, created_by: ownerA.id, vessel_name: "AACIR Anchor Vessel A" })
      .select("id")
      .single();

    const { data: serviceTypeA } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("code", "standard")
      .single();

    const { data: facilityLocationA } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_A_ID, name: "AACIR Anchor Facility A" })
      .select("id")
      .single();

    const { data: projectA } = await admin
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselA!.id,
        client_id: clientA!.id,
        service_type_id: serviceTypeA!.id,
        facility_location_id: facilityLocationA!.id,
        start_date: "2036-01-01",
        created_by: ownerA.id,
      })
      .select("id")
      .single();
    projectAId = projectA!.id;
    createdProjectIds.push(projectAId);
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    if (createdClientIds.length > 0) {
      await admin.from("clients").delete().in("id", createdClientIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function stageAndCommitBatch(businessDate: string, sha: string): Promise<string> {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error: createError } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-aacir.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: businessDate,
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_270_000,
      p_rows: buildFullRowsFixture(),
    });
    expect(createError).toBeNull();
    const batchId = created.batch.id as string;

    await adminAClient.rpc("set_cash_import_label_mapping", { p_batch_id: batchId, p_vessel_label: "Kas", p_mapping_kind: "cash" });
    await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "KM Anchor",
      p_mapping_kind: "existing_vessel_project",
      p_mapped_vessel_project_id: projectAId,
    });
    await adminAClient.rpc("set_cash_import_label_mapping", { p_batch_id: batchId, p_vessel_label: "Lain-lain", p_mapping_kind: "shared_overhead" });

    const { data: rows } = await adminAClient.from("cash_import_rows").select("id, vessel_label").eq("batch_id", batchId);
    for (const row of rows!) {
      if (row.vessel_label === null) continue;
      await adminAClient.rpc("set_cash_import_row_disposition", { p_row_id: row.id, p_disposition: "include" });
    }

    const { error: readyError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", { p_batch_id: batchId });
    expect(readyError).toBeNull();

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: committed, error: commitError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", {
      p_batch_id: batchId,
    });
    expect(commitError).toBeNull();
    expect(committed.status).toBe("committed");

    return batchId;
  }

  it("admin cannot rollback; viewer/cross-tenant-owner rejected; same-tenant owner succeeds with full accounting reversal", async () => {
    const businessDate = randomBusinessDate();
    const batchId = await stageAndCommitBatch(businessDate, randomSha("aacir-role"));

    const adminAClient = await signInAsMember(adminA.email);
    const { error: adminRollbackError } = await adminAClient.rpc("rollback_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "admin coba rollback",
    });
    expect(adminRollbackError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerRollbackError } = await viewerAClient.rpc("rollback_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "viewer coba rollback",
    });
    expect(viewerRollbackError).not.toBeNull();

    const ownerBClient = await signInAsMember(ownerB.email);
    const { error: crossTenantRollbackError } = await ownerBClient.rpc("rollback_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "owner tenant lain coba rollback",
    });
    expect(crossTenantRollbackError).not.toBeNull();

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: rolledBack, error: rollbackError } = await ownerAClient.rpc("rollback_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "Rehearsal rollback import demo",
    });
    expect(rollbackError).toBeNull();
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.rollback_reversal_count).toBe(6);
    expect(Number(rolledBack.rollback_reversed_cash_effect)).toBe(1_500_000);
    expect(Number(rolledBack.rollback_reversed_project_cost)).toBe(200_000);
    expect(Number(rolledBack.rollback_reversed_shared_overhead)).toBe(80_000);
    expect(Number(rolledBack.rollback_reversed_refund_effect)).toBe(50_000);

    // Accounting effect returns to baseline.
    const { data: pool } = await admin
      .from("cash_pools")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate)
      .single();
    const { data: summary } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("*")
      .eq("pool_id", pool!.id)
      .single();
    expect(Number(summary!.closing_cash)).toBe(0);
    expect(Number(summary!.total_cash_out)).toBe(0);

    const { data: costSummary } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projectAId)
      .single();
    expect(Number(costSummary!.total_cost)).toBe(0);

    // Original rows remain; reversal rows exist and point back at them.
    const { count: originalCashCount } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId)
      .eq("entry_kind", "entry");
    expect(originalCashCount).toBe(3);
    const { count: reversalCashCount } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId)
      .eq("entry_kind", "reversal");
    expect(reversalCashCount).toBe(3);

    // Already-rolled-back batch rejects a second attempt.
    const { error: secondRollbackError } = await ownerAClient.rpc("rollback_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "coba rollback dua kali",
    });
    expect(secondRollbackError).not.toBeNull();
    expect(secondRollbackError!.message).toContain("BATCH_ALREADY_ROLLED_BACK");
  });

  it("concurrent rollback: two simultaneous rollback calls on the same batch produce exactly one rolled-back result", async () => {
    const businessDate = randomBusinessDate();
    const batchId = await stageAndCommitBatch(businessDate, randomSha("aacir-concurrent"));

    const ownerAClientOne = await signInAsMember(ownerA.email);
    const ownerAClientTwo = await signInAsMember(ownerA.email);

    const [resultOne, resultTwo] = await Promise.all([
      ownerAClientOne.rpc("rollback_cash_import_batch", { p_batch_id: batchId, p_reason: "concurrent rollback attempt one" }),
      ownerAClientTwo.rpc("rollback_cash_import_batch", { p_batch_id: batchId, p_reason: "concurrent rollback attempt two" }),
    ]);

    const outcomes = [resultOne, resultTwo];
    const succeeded = outcomes.filter((r) => r.error === null);
    const failed = outcomes.filter((r) => r.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error!.message).toContain("BATCH_ALREADY_ROLLED_BACK");

    const { data: batch } = await admin.from("cash_import_batches").select("status, rollback_reversal_count").eq("id", batchId).single();
    expect(batch!.status).toBe("rolled_back");
    expect(batch!.rollback_reversal_count).toBe(6);

    const { data: pool } = await admin
      .from("cash_pools")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate)
      .single();
    const { count: reversalCashCount } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool!.id)
      .eq("entry_kind", "reversal");
    // opening + top-up + refund cash-in reversal = exactly 3, never 6.
    expect(reversalCashCount).toBe(3);
    const { count: reversalLedgerCount } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool!.id)
      .eq("entry_kind", "reversal");
    // expense + shared overhead + refund cost-reduction reversal = exactly 3, never 6.
    expect(reversalLedgerCount).toBe(3);
  });
});
