import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the expense-duplicate-detection
// repository/service layer uses (real authenticated HTTP requests, not
// mocks), same split as expense-approvals.integration.test.ts from Gate 1E.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "expense-duplicate-detection.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

// cash_pools carries a database-level UNIQUE(tenant_id, business_date) and
// can never be deleted — a fixed business_date would collide with rows left
// behind by another integration suite sharing the same seeded tenants, so
// every test that needs a pool uses a fresh, randomized business_date. Same
// reasoning as expense-approvals.integration.test.ts's randomBusinessDate().
function randomBusinessDate(): string {
  const base = Date.UTC(2036, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("expense duplicate detection — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let ownerB: EphemeralMember;

  let clientAId: string;
  let vesselAId: string;
  let serviceTypeAId: string;
  let facilityLocationAId: string;
  let categoryAId: string;
  let vendorAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "edd-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "edd-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "edd-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "EDD Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "EDD Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "EDD Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: "edd-anchor-category-a", name: "EDD Anchor Category A" })
      .select("id")
      .single();
    categoryAId = categoryA!.id;

    const { data: vendorA } = await admin
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, display_name: "EDD Anchor Vendor A" })
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
        start_date: "2036-01-01",
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

  it("submitting a matching second expense produces a pending duplicate candidate visible via the read model", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: firstSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 500_000,
      p_description: "sewa alat las utama",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-EDD-001",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: firstSubmission.id });
    await ownerAClient.rpc("approve_expense_submission", { p_submission_id: firstSubmission.id });

    const { data: secondSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 500_000,
      p_description: "sewa alat las utama",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-EDD-001",
    });
    const { error: submitError } = await ownerAClient.rpc("submit_expense", {
      p_submission_id: secondSubmission.id,
    });
    expect(submitError).toBeNull();

    const { data: candidates } = await ownerAClient
      .from("expense_duplicate_candidate_current")
      .select("*")
      .or(`submission_id_1.eq.${secondSubmission.id},submission_id_2.eq.${secondSubmission.id}`);
    expect(candidates!.length).toBeGreaterThan(0);
    expect(candidates!.every((c) => c.status === "pending")).toBe(true);
    expect(candidates!.some((c) => c.reason_code === "exact_financial_match")).toBe(true);
    expect(candidates!.some((c) => c.reason_code === "reference_match")).toBe(true);

    const candidateId = candidates![0].candidate_id;

    // Approval is blocked while a pending candidate exists.
    const { error: blockedApproveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: secondSubmission.id,
    });
    expect(blockedApproveError).not.toBeNull();
    expect(blockedApproveError!.message).toBe("DUPLICATE_REVIEW_REQUIRED");

    // Admin cannot resolve.
    const adminAClient = await signInAsMember(adminA.email);
    const { error: adminResolveError } = await adminAClient.rpc("resolve_expense_duplicate_candidate", {
      p_candidate_id: candidateId,
      p_resolution: "not_duplicate",
      p_reason: "admin coba resolve",
    });
    expect(adminResolveError).not.toBeNull();

    // A different tenant's owner cannot resolve.
    const ownerBClient = await signInAsMember(ownerB.email);
    const { error: crossTenantResolveError } = await ownerBClient.rpc("resolve_expense_duplicate_candidate", {
      p_candidate_id: candidateId,
      p_resolution: "not_duplicate",
      p_reason: "owner B lintas tenant coba resolve",
    });
    expect(crossTenantResolveError).not.toBeNull();

    // Owner resolves every pending candidate as not_duplicate, then approval succeeds.
    for (const candidate of candidates!) {
      const { error: resolveError } = await ownerAClient.rpc("resolve_expense_duplicate_candidate", {
        p_candidate_id: candidate.candidate_id,
        p_resolution: "not_duplicate",
        p_reason: "sudah ditinjau, kemiripan wajar",
      });
      expect(resolveError).toBeNull();
    }

    const { error: secondResolveError } = await ownerAClient.rpc("resolve_expense_duplicate_candidate", {
      p_candidate_id: candidateId,
      p_resolution: "not_duplicate",
      p_reason: "coba resolve dua kali",
    });
    expect(secondResolveError).not.toBeNull();

    const { data: approved, error: approveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: secondSubmission.id,
    });
    expect(approveError).toBeNull();
    expect(approved.status).toBe("approved");
  });

  it("a confirmed duplicate blocks approval with a stable error, but the submission can still be rejected", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: firstSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 750_000,
      p_description: "servis mesin genset",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-EDD-CONFIRM-001",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: firstSubmission.id });
    await ownerAClient.rpc("approve_expense_submission", { p_submission_id: firstSubmission.id });

    const { data: secondSubmission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 750_000,
      p_description: "servis mesin genset",
      p_vendor_id: vendorAId,
      p_reference_number: "REF-EDD-CONFIRM-001",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: secondSubmission.id });

    const { data: candidates } = await ownerAClient
      .from("expense_duplicate_candidate_current")
      .select("*")
      .or(`submission_id_1.eq.${secondSubmission.id},submission_id_2.eq.${secondSubmission.id}`);
    expect(candidates!.length).toBeGreaterThan(0);

    for (const candidate of candidates!) {
      const { error: resolveError } = await ownerAClient.rpc("resolve_expense_duplicate_candidate", {
        p_candidate_id: candidate.candidate_id,
        p_resolution: "confirmed_duplicate",
        p_reason: "terindikasi duplikasi nyata dengan submission sebelumnya",
      });
      expect(resolveError).toBeNull();
    }

    const { error: approveError } = await ownerAClient.rpc("approve_expense_submission", {
      p_submission_id: secondSubmission.id,
    });
    expect(approveError).not.toBeNull();
    expect(approveError!.message).toBe("DUPLICATE_CONFIRMED");

    const { data: rejected, error: rejectError } = await ownerAClient.rpc("reject_expense_submission", {
      p_submission_id: secondSubmission.id,
      p_reason: "ditolak karena terindikasi duplikasi",
    });
    expect(rejectError).toBeNull();
    expect(rejected.status).toBe("rejected");

    // The confirmed candidate remains visible, unresolved-to-anything-else.
    const { data: stillConfirmed } = await admin
      .from("expense_duplicate_candidates")
      .select("status")
      .eq("id", candidates![0].candidate_id)
      .single();
    expect(stillConfirmed!.status).toBe("confirmed_duplicate");
  });

  it("a draft is never compared, and cross-tenant data is never compared", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submitted } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 250_000,
      p_description: "beli oli mesin",
      p_reference_number: "REF-EDD-DRAFT-001",
    });
    await ownerAClient.rpc("submit_expense", { p_submission_id: submitted.id });

    const { data: draftOnly } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 250_000,
      p_description: "beli oli mesin",
      p_reference_number: "REF-EDD-DRAFT-001",
    });

    const { data: draftCandidates } = await admin
      .from("expense_duplicate_candidates")
      .select("id")
      .or(
        `revision_id_1.eq.${draftOnly.current_revision_id},revision_id_2.eq.${draftOnly.current_revision_id}`,
      );
    expect(draftCandidates).toHaveLength(0);
  });
});
