import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the expense-approvals
// repository/service layer uses (real authenticated HTTP requests, not
// mocks), same split as cost-ledger.integration.test.ts from Gate 1D.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "expense-approvals.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-1111-1111-111111111111";
const TENANT_B_ID = "b2222222-2222-2222-2222-222222222222";

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

// cash_pools carries a database-level UNIQUE(tenant_id, business_date) and
// can never be deleted — a fixed business_date would collide with rows left
// behind by another integration suite sharing the same seeded tenants, so
// every test that needs a pool uses a fresh, randomized business_date. Same
// reasoning as cost-ledger.integration.test.ts's randomBusinessDate().
function randomBusinessDate(): string {
  const base = Date.UTC(2034, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("expense submission & owner approval workflow — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let clientAId: string;
  let vesselAId: string;
  let serviceTypeAId: string;
  let facilityLocationAId: string;
  let categoryAId: string;
  let vendorAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "ea-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "ea-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "ea-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "ea-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "ea-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "EA Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "EA Anchor Vessel A" })
      .select("id")
      .single();
    vesselAId = vesselA!.id;

    const { data: serviceTypeA } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("code", "standard")
      .single();
    serviceTypeAId = serviceTypeA!.id;

    const { data: facilityLocationA } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_A_ID, name: "EA Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: "ea-anchor-category-a", name: "EA Anchor Category A" })
      .select("id")
      .single();
    categoryAId = categoryA!.id;

    const { data: vendorA } = await admin
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, display_name: "EA Anchor Vendor A" })
      .select("id")
      .single();
    vendorAId = vendorA!.id;
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    if (clientAId) {
      await admin.from("clients").delete().eq("id", clientAId);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function createActiveProjectForTenantA(): Promise<string> {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { data } = await ownerAClient
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_A_ID,
        vessel_id: vesselAId,
        client_id: clientAId,
        service_type_id: serviceTypeAId,
        facility_location_id: facilityLocationAId,
        start_date: "2034-01-01",
        created_by: ownerA.id,
      })
      .select("id")
      .single();
    createdProjectIds.push(data!.id);
    return data!.id;
  }

  async function createFundedPoolForTenantA(): Promise<{ poolId: string; businessDate: string }> {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    return { poolId: pool.id, businessDate };
  }

  it("admin can create a draft; reviewer/viewer and a different tenant's owner cannot", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const adminAClient = await signInAsMember(adminA.email);
    const { data: submission, error } = await adminAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 500_000,
      p_description: "beli spare part",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-001",
    });
    expect(error).toBeNull();
    expect(submission.status).toBe("draft");
    expect(submission.tenant_id).toBe(TENANT_A_ID);

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerError } = await reviewerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 1000,
      p_description: "reviewer coba buat draft",
    });
    expect(reviewerError).not.toBeNull();

    const ownerBClient = await signInAsMember(ownerB.email);
    const { error: crossTenantError } = await ownerBClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 1000,
      p_description: "owner B lintas tenant",
    });
    expect(crossTenantError).not.toBeNull();
  });

  it("a draft can be revised, keeping its revision history intact, but not after submission", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 400_000,
      p_description: "biaya awal",
    });

    const { data: revised, error: reviseError } = await ownerAClient.rpc("revise_expense_draft", {
      p_submission_id: submission.id,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 450_000,
      p_description: "biaya awal (revisi)",
    });
    expect(reviseError).toBeNull();
    expect(revised.current_revision_id).not.toBe(submission.current_revision_id);

    const { data: revisions } = await admin
      .from("expense_submission_revisions")
      .select("revision_number, amount")
      .eq("submission_id", submission.id)
      .order("revision_number");
    expect(revisions).toHaveLength(2);
    expect(revisions![0].amount).toBe(400_000);
    expect(revisions![1].amount).toBe(450_000);

    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });

    const { error: overwriteError } = await ownerAClient.rpc("revise_expense_draft", {
      p_submission_id: submission.id,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 999_999,
      p_description: "coba overwrite setelah submit",
    });
    expect(overwriteError).not.toBeNull();

    const { count } = await admin
      .from("expense_submission_revisions")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", submission.id);
    expect(count).toBe(2);
  });

  it("only the owner can approve/reject/request correction — admin, reviewer, and viewer cannot", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 100_000,
      p_description: "biaya review-permission",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });

    const adminAClient = await signInAsMember(adminA.email);
    const { error: adminApproveError } = await adminAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(adminApproveError).not.toBeNull();

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerRejectError } = await reviewerAClient.rpc("reject_expense_submission", {
      p_submission_id: submission.id,
      p_reason: "reviewer coba reject",
    });
    expect(reviewerRejectError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerCorrectionError } = await viewerAClient.rpc("request_expense_correction", {
      p_submission_id: submission.id,
      p_reason: "viewer coba minta koreksi",
    });
    expect(viewerCorrectionError).not.toBeNull();
  });

  it("approval posts exactly one ledger entry, and a repeated approval does not duplicate it", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 750_000,
      p_description: "biaya approve tunggal",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-APPROVE-1",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });

    const { data: approved, error: approveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(approveError).toBeNull();
    expect(approved.status).toBe("approved");
    expect(approved.ledger_entry_id).not.toBeNull();

    const { count } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(count).toBe(1);

    const { data: entry } = await admin
      .from("project_cost_ledger_entries")
      .select("amount, vendor_id, reference_number")
      .eq("id", approved.ledger_entry_id)
      .single();
    expect(entry!.amount).toBe(750_000);
    expect(entry!.vendor_id).toBe(vendorAId);
    expect(entry!.reference_number).toBe("REF-APPROVE-1");

    const { error: secondApproveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(secondApproveError).not.toBeNull();

    const { count: countAfterRepeat } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(countAfterRepeat).toBe(1);
  });

  it("reject and needs_correction leave cash/cost untouched", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const rejectedProjectId = await createActiveProjectForTenantA();
    const correctionProjectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: rejectedSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: rejectedProjectId,
      p_category_id: categoryAId,
      p_amount: 300_000,
      p_description: "biaya untuk ditolak",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: rejectedSubmission.id });
    const { error: emptyReasonError } = await ownerAClient.rpc("reject_expense_submission", {
      p_submission_id: rejectedSubmission.id,
      p_reason: "",
    });
    expect(emptyReasonError).not.toBeNull();
    const { data: rejected } = await ownerAClient.rpc("reject_expense_submission", {
      p_submission_id: rejectedSubmission.id,
      p_reason: "nominal tidak sesuai bukti",
    });
    expect(rejected.status).toBe("rejected");

    const { data: correctionSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: correctionProjectId,
      p_category_id: categoryAId,
      p_amount: 200_000,
      p_description: "biaya butuh koreksi",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: correctionSubmission.id });
    const { data: needsCorrection } = await ownerAClient.rpc("request_expense_correction", {
      p_submission_id: correctionSubmission.id,
      p_reason: "kategori salah",
    });
    expect(needsCorrection.status).toBe("needs_correction");

    const { count: rejectedLedgerCount } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", rejectedProjectId);
    expect(rejectedLedgerCount).toBe(0);

    const { count: correctionLedgerCount } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", correctionProjectId);
    expect(correctionLedgerCount).toBe(0);

    const { data: rejectedSummary } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", rejectedProjectId)
      .single();
    expect(rejectedSummary!.total_cost).toBe(0);
  });

  it("needs_correction requires a fresh revision before resubmission, and the corrected revision is what gets approved", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);
    const adminAClient = await signInAsMember(adminA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 500_000,
      p_description: "biaya sebelum koreksi",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });
    await ownerAClient.rpc("request_expense_correction", {
      p_submission_id: submission.id,
      p_reason: "nominal perlu ditinjau ulang",
    });

    const { error: resubmitWithoutRevisionError } = await adminAClient.rpc("submit_expense", {
      p_submission_id: submission.id,
    });
    expect(resubmitWithoutRevisionError).not.toBeNull();

    await adminAClient.rpc("revise_expense_draft", {
      p_submission_id: submission.id,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 480_000,
      p_description: "biaya setelah koreksi",
    });
    const { error: resubmitError } = await adminAClient.rpc("submit_expense", { p_submission_id: submission.id });
    expect(resubmitError).toBeNull();

    const { data: approved } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    const { data: entry } = await admin
      .from("project_cost_ledger_entries")
      .select("amount")
      .eq("id", approved.ledger_entry_id)
      .single();
    expect(entry!.amount).toBe(480_000);
  });

  it("a project that closes after submission but before approval is rejected at approval time", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 150_000,
      p_description: "biaya project yang akan ditutup",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });

    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "ready_to_close",
    });
    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "closed",
    });

    const { error: approveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(approveError).not.toBeNull();

    const { data: stillSubmitted } = await admin
      .from("expense_submissions")
      .select("status")
      .eq("id", submission.id)
      .single();
    expect(stillSubmitted!.status).toBe("submitted");

    const { count } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(count).toBe(0);
  });

  it("actor and tenant on a submission are always server-derived, never client-suppliable", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const adminAClient = await signInAsMember(adminA.email);
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await adminAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 100_000,
      p_description: "biaya actor check",
    });
    expect(submission.created_by).toBe(adminA.id);

    await adminAClient.rpc("submit_expense", { p_submission_id: submission.id });
    const { data: approved } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(approved.decided_by).toBe(ownerA.id);

    const { error: insertError } = await adminAClient.from("expense_submissions").insert({
      tenant_id: TENANT_A_ID,
      status: "approved",
      created_by: adminA.id,
    } as never);
    expect(insertError).not.toBeNull();

    const { error: updateError } = await adminAClient
      .from("expense_submissions")
      .update({ status: "approved" } as never)
      .eq("id", submission.id);
    expect(updateError).not.toBeNull();
  });

  it("admin cannot reverse a ledger entry directly — reversal is owner-only as of Gate 1E", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);
    const adminAClient = await signInAsMember(adminA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 220_000,
      p_description: "biaya untuk uji reversal owner-only",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });
    const { data: approved } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });

    const { error: adminReverseError } = await adminAClient.rpc("reverse_project_expense", {
      p_entry_id: approved.ledger_entry_id,
      p_reason: "admin coba reverse langsung",
    });
    expect(adminReverseError).not.toBeNull();

    const { error: ownerReverseError } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: approved.ledger_entry_id,
      p_reason: "owner masih bisa reverse",
    });
    expect(ownerReverseError).toBeNull();
  });

  it("expense_submission_revisions and expense_submission_status_events reject direct authenticated mutation", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 50_000,
      p_description: "biaya append-only check",
    });

    const { error: updateRevisionError } = await ownerAClient
      .from("expense_submission_revisions")
      .update({ amount: 1 } as never)
      .eq("submission_id", submission.id);
    expect(updateRevisionError).not.toBeNull();

    const { error: deleteEventError } = await ownerAClient
      .from("expense_submission_status_events")
      .delete()
      .eq("submission_id", submission.id);
    expect(deleteEventError).not.toBeNull();
  });

  it("Tenant A cannot read or approve Tenant B's expense submissions", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 60_000,
      p_description: "biaya lintas tenant check",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });

    const { data: seenByB } = await ownerBClient
      .from("expense_submissions")
      .select("id")
      .eq("id", submission.id);
    expect(seenByB).toHaveLength(0);

    const { error: crossApproveError } = await ownerBClient.rpc("approve_expense_submission", {
      p_submission_id: submission.id,
    });
    expect(crossApproveError).not.toBeNull();
  });

  it("anonymous requests get zero access to expense submissions and the approval RPCs", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.from("expense_submissions").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    const { error: rpcError } = await anonClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: "00000000-0000-0000-0000-000000000000",
      p_project_id: "00000000-0000-0000-0000-000000000000",
      p_category_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 1,
      p_description: "anon",
    });
    expect(rpcError).not.toBeNull();
  });
});
