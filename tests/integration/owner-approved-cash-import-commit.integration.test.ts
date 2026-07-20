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
// repository/service layer uses for Gate 1J-C's owner-approved canonical
// commit (approve_and_commit_cash_import_batch / reject_cash_import_batch,
// 20260720120000_owner_approved_cash_import_commit.sql). This file focuses
// on what genuinely needs a real HTTP round trip and true concurrency —
// every business-rule invariant (canonical bucket shape, atomicity,
// provenance uniqueness, opening-balance fail-closed, immutability) already
// has an exhaustive, deterministic proof in
// supabase/tests/database/owner_approved_cash_import_commit.test.sql.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "owner-approved-cash-import-commit.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

// Mirrors cash-pool.integration.test.ts's own randomBusinessDate() — sibling
// integration files run in parallel against the same local Supabase
// instance, and this gate's OPENING_BALANCE_CONFLICT check means a
// collision on tenant+business_date would be a false failure, not a real
// bug. A random date over a ~55-year window makes that collision
// astronomically unlikely without needing any cross-file coordination.
function randomBusinessDate(): string {
  const base = Date.UTC(2031, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// One opening row + one cash top-up + one project expense + one shared
// overhead + one project refund — enough to exercise every canonical
// posting kind in a single ready_for_review batch.
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

describe("owner-approved cash import commit — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let projectAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "oacic-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "oacic-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "oacic-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "oacic-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "OACIC Anchor Client A" })
      .select("id")
      .single();
    createdClientIds.push(clientA!.id);

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientA!.id, created_by: ownerA.id, vessel_name: "OACIC Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "OACIC Anchor Facility A" })
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

  async function stageReadyBatch(businessDate: string, sha: string) {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error: createError } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-oacic.xlsx",
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

    const { data: ready, error: readyError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", { p_batch_id: batchId });
    expect(readyError).toBeNull();
    expect(ready.status).toBe("ready_for_review");

    return batchId;
  }

  it("admin cannot approve/commit or reject; viewer/cross-tenant-owner rejected; same-tenant owner succeeds", async () => {
    const batchId = await stageReadyBatch(randomBusinessDate(), randomSha("oacic-role"));

    const adminAClient = await signInAsMember(adminA.email);
    const { error: adminApproveError } = await adminAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
    expect(adminApproveError).not.toBeNull();
    const { error: adminRejectError } = await adminAClient.rpc("reject_cash_import_batch", { p_batch_id: batchId, p_reason: "x" });
    expect(adminRejectError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerApproveError } = await viewerAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
    expect(viewerApproveError).not.toBeNull();

    const ownerBClient = await signInAsMember(ownerB.email);
    const { error: crossTenantApproveError } = await ownerBClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
    expect(crossTenantApproveError).not.toBeNull();
    const { data: crossTenantVisibility } = await ownerBClient.from("cash_import_batches").select("id").eq("id", batchId);
    expect(crossTenantVisibility).toEqual([]);

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: committed, error: approveError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
    expect(approveError).toBeNull();
    expect(committed.status).toBe("committed");
    expect(Number(committed.canonical_opening_cash)).toBe(1_000_000);
    expect(Number(committed.canonical_cash_top_up_total)).toBe(500_000);
    expect(Number(committed.canonical_project_expense_total)).toBe(200_000);
    expect(Number(committed.canonical_shared_overhead_total)).toBe(80_000);
    expect(Number(committed.canonical_project_refund_total)).toBe(50_000);
    expect(Number(committed.canonical_closing_cash)).toBe(1_270_000);

    // Canonical postings are actually queryable and net of the refund.
    const { data: costSummary } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projectAId)
      .single();
    expect(Number(costSummary!.total_cost)).toBe(150_000); // 200,000 expense - 50,000 refund

    // Post-commit tenant isolation.
    const { data: crossTenantAfterCommit } = await ownerBClient.from("cash_import_batches").select("id").eq("id", batchId);
    expect(crossTenantAfterCommit).toEqual([]);

    // Second approval is rejected deterministically — no duplicate posting.
    const { error: secondApproveError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
    expect(secondApproveError).not.toBeNull();
    expect(secondApproveError!.message).toContain("BATCH_ALREADY_COMMITTED");

    // Immutable after commit.
    const { error: postCommitMappingError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "Kas",
      p_mapping_kind: "shared_overhead",
    });
    expect(postCommitMappingError).not.toBeNull();
    expect(postCommitMappingError!.message).toContain("BATCH_COMMITTED_IMMUTABLE");
  });

  it("owner rejection returns the batch to mapping_required with zero canonical mutation, then reject -> revise -> re-approve succeeds", async () => {
    const batchId = await stageReadyBatch(randomBusinessDate(), randomSha("oacic-reject"));

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: rejected, error: rejectError } = await ownerAClient.rpc("reject_cash_import_batch", {
      p_batch_id: batchId,
      p_reason: "mapping kapal salah, tolong perbaiki",
    });
    expect(rejectError).toBeNull();
    expect(rejected.status).toBe("mapping_required");

    const { count: entriesAfterReject } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId);
    expect(entriesAfterReject ?? 0).toBe(0);

    const adminAClient = await signInAsMember(adminA.email);
    const { data: readyAgain, error: readyAgainError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(readyAgainError).toBeNull();
    expect(readyAgain.status).toBe("ready_for_review");

    const { data: committedAfterReject, error: approveAfterRejectError } = await ownerAClient.rpc(
      "approve_and_commit_cash_import_batch",
      { p_batch_id: batchId },
    );
    expect(approveAfterRejectError).toBeNull();
    expect(committedAfterReject.status).toBe("committed");
  });

  it("opening balance conflict: a second batch for the same business date is rejected fail-closed", async () => {
    const businessDate = randomBusinessDate();
    const firstBatchId = await stageReadyBatch(businessDate, randomSha("oacic-open-first"));

    const ownerAClient = await signInAsMember(ownerA.email);
    const { error: firstApproveError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: firstBatchId });
    expect(firstApproveError).toBeNull();

    const secondBatchId = await stageReadyBatch(businessDate, randomSha("oacic-open-second"));
    const { error: secondApproveError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", { p_batch_id: secondBatchId });
    expect(secondApproveError).not.toBeNull();
    expect(secondApproveError!.message).toContain("OPENING_BALANCE_CONFLICT");
  });

  it("concurrent approval: two simultaneous approve calls on the same batch produce exactly one committed posting", async () => {
    const businessDate = randomBusinessDate();
    const batchId = await stageReadyBatch(businessDate, randomSha("oacic-concurrent"));

    const ownerAClientOne = await signInAsMember(ownerA.email);
    const ownerAClientTwo = await signInAsMember(ownerA.email);

    const [resultOne, resultTwo] = await Promise.all([
      ownerAClientOne.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId }),
      ownerAClientTwo.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId }),
    ]);

    const outcomes = [resultOne, resultTwo];
    const succeeded = outcomes.filter((r) => r.error === null);
    const failed = outcomes.filter((r) => r.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error!.message).toContain("BATCH_ALREADY_COMMITTED");

    const { data: batch } = await admin.from("cash_import_batches").select("status").eq("id", batchId).single();
    expect(batch!.status).toBe("committed");

    const { data: pool } = await admin
      .from("cash_pools")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("business_date", businessDate)
      .single();
    const { count: cashPoolEntryCount } = await admin
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool!.id);
    // opening + cash top-up + project refund = exactly 3, never 6.
    expect(cashPoolEntryCount).toBe(3);
    const { count: ledgerEntryCount } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool!.id);
    // project expense + shared overhead + refund cost-reduction = exactly 3, never 6.
    expect(ledgerEntryCount).toBe(3);
  });
});
