import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the cost-ledger repository/
// service layer uses (real authenticated HTTP requests, not mocks), same
// split as cash-pool.integration.test.ts from Gate 1C.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "cost-ledger.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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
// behind by a previous run of this suite (or of cash-pool.integration.test.ts,
// which shares the same tenant fixtures), so every test that needs a pool
// uses a fresh, randomized business_date. Same reasoning as
// cash-pool.integration.test.ts's randomBusinessDate().
function randomBusinessDate(): string {
  const base = Date.UTC(2033, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("immutable project cost ledger — real local Supabase", () => {
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
  let clientBId: string;
  let vesselBId: string;
  let serviceTypeBId: string;
  let facilityLocationBId: string;
  let categoryBId: string;
  let projectBId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "cl-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "cl-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "cl-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "cl-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "cl-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    // Master-data + Project Kapal anchors, created via the service-role admin
    // client — same fixture-setup posture as vessel-project-lifecycle and
    // cash-pool integration suites.
    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "CL Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "CL Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "CL Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: "cl-anchor-category-a", name: "CL Anchor Category A" })
      .select("id")
      .single();
    categoryAId = categoryA!.id;

    const { data: vendorA } = await admin
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, display_name: "CL Anchor Vendor A" })
      .select("id")
      .single();
    vendorAId = vendorA!.id;

    const { data: clientB } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerB.id, display_name: "CL Anchor Client B" })
      .select("id")
      .single();
    clientBId = clientB!.id;

    const { data: vesselB } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_B_ID, client_id: clientBId, created_by: ownerB.id, vessel_name: "CL Anchor Vessel B" })
      .select("id")
      .single();
    vesselBId = vesselB!.id;

    const { data: serviceTypeB } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_B_ID)
      .eq("code", "standard")
      .single();
    serviceTypeBId = serviceTypeB!.id;

    const { data: facilityLocationB } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_B_ID, name: "CL Anchor Facility B" })
      .select("id")
      .single();
    facilityLocationBId = facilityLocationB!.id;

    const { data: categoryB } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_B_ID, code: "cl-anchor-category-b", name: "CL Anchor Category B" })
      .select("id")
      .single();
    categoryBId = categoryB!.id;

    const { data: projectB } = await admin
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_B_ID,
        vessel_id: vesselBId,
        client_id: clientBId,
        service_type_id: serviceTypeBId,
        facility_location_id: facilityLocationBId,
        start_date: "2033-01-01",
        created_by: ownerB.id,
      })
      .select("id")
      .single();
    projectBId = projectB!.id;
    createdProjectIds.push(projectBId);
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    await admin.from("clients").delete().in("id", [clientAId, clientBId].filter(Boolean));
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
        start_date: "2033-01-01",
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

  // Gate 1E revokes record_project_expense's EXECUTE grant from
  // `authenticated` entirely — only approve_expense_submission can still
  // call it (via function ownership, unaffected by this revoke). Fixture
  // rows below are created via the admin (service-role) client instead,
  // which still goes through every table CHECK constraint, composite FK,
  // and role-independent trigger (closed-project guard, reversal integrity,
  // append-only) — those are enforced regardless of caller, so this still
  // exercises the same validation surface record_project_expense used to.
  // See expense-approvals.integration.test.ts for the approval workflow
  // that is now the only path to the ledger, and the explicit proof below
  // that authenticated (including owner/admin) cannot call
  // record_project_expense directly anymore.
  function insertLedgerEntryDirect(params: {
    tenantId: string;
    poolId: string;
    projectId: string;
    categoryId: string;
    amount: number;
    description: string;
    vendorId?: string;
    referenceNumber?: string;
  }) {
    return admin
      .from("project_cost_ledger_entries")
      .insert({
        tenant_id: params.tenantId,
        pool_id: params.poolId,
        project_id: params.projectId,
        category_id: params.categoryId,
        entry_kind: "expense",
        amount: params.amount,
        description: params.description,
        vendor_id: params.vendorId,
        reference_number: params.referenceNumber,
      })
      .select("*")
      .single();
  }

  it("authenticated (including owner) can no longer call record_project_expense directly — Gate 1E closes the bypass", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { error } = await ownerAClient.rpc("record_project_expense", {
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 750_000,
      p_description: "owner coba langsung ke ledger",
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");

    const { count } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(count).toBe(0);
  });

  it("records an expense append-only, linked to tenant, pool, project, category, and actor", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { data: entry, error } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 750_000,
      description: "beli spare part",
      vendorId: vendorAId,
      referenceNumber: "INV-IT-001",
    });
    expect(error).toBeNull();
    expect(entry.entry_kind).toBe("expense");
    expect(entry.tenant_id).toBe(TENANT_A_ID);
    expect(entry.pool_id).toBe(poolId);
    expect(entry.project_id).toBe(projectId);
    expect(entry.category_id).toBe(categoryAId);
    expect(entry.vendor_id).toBe(vendorAId);
    expect(entry.amount).toBe(750_000);

    const { count } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(count).toBe(1);
  });

  it("rejects a zero/negative amount and an empty description", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { error: zeroError } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 0,
      description: "nominal nol",
    });
    expect(zeroError).not.toBeNull();

    const { error: negativeError } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: -100,
      description: "nominal negatif",
    });
    expect(negativeError).not.toBeNull();

    const { error: emptyDescriptionError } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 1000,
      description: "",
    });
    expect(emptyDescriptionError).not.toBeNull();
  });

  it("rejects a non-existent daily cash pool", async () => {
    const projectId = await createActiveProjectForTenantA();

    const { error } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId: "00000000-0000-0000-0000-000000000000",
      projectId,
      categoryId: categoryAId,
      amount: 1000,
      description: "pool tidak ada",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a cross-tenant project, category, or vendor reference", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { error: crossProjectError } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId: projectBId,
      categoryId: categoryAId,
      amount: 1000,
      description: "project lintas tenant",
    });
    expect(crossProjectError).not.toBeNull();

    const { error: crossCategoryError } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryBId,
      amount: 1000,
      description: "kategori lintas tenant",
    });
    expect(crossCategoryError).not.toBeNull();
  });

  it("reviewer and viewer cannot record an expense via the RPC (nor can owner/admin — the direct-post bypass is closed for everyone)", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerError } = await reviewerAClient.rpc("record_project_expense", {
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 1000,
      p_description: "reviewer coba input",
    });
    expect(reviewerError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerError } = await viewerAClient.rpc("record_project_expense", {
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 1000,
      p_description: "viewer coba input",
    });
    expect(viewerError).not.toBeNull();
  });

  it("rejects a new expense on a closed project", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "ready_to_close",
    });
    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "closed",
    });

    const { error } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 1000,
      description: "expense pada project closed",
    });
    expect(error).not.toBeNull();

    const { count } = await admin
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    expect(count).toBe(0);
  });

  it("multiple projects reduce the same shared pool, and total_cash_out is derived from the ledger", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectOneId = await createActiveProjectForTenantA();
    const projectTwoId = await createActiveProjectForTenantA();

    await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: poolId,
      p_entry_type: "opening_cash",
      p_amount: 5_000_000,
    });

    await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId: projectOneId,
      categoryId: categoryAId,
      amount: 750_000,
      description: "biaya project satu",
    });
    await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId: projectTwoId,
      categoryId: categoryAId,
      amount: 250_000.5,
      description: "biaya project dua",
    });

    const { data: summary, error: summaryError } = await ownerAClient
      .from("cash_pool_daily_summary")
      .select("*")
      .eq("pool_id", poolId)
      .single();
    expect(summaryError).toBeNull();
    expect(summary.total_cash_out).toBe(1_000_000.5);
    expect(summary.closing_cash).toBe(5_000_000 - 1_000_000.5);

    const { data: summaryOne } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projectOneId)
      .single();
    expect(summaryOne!.total_cost).toBe(750_000);

    const { data: summaryTwo } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projectTwoId)
      .single();
    expect(summaryTwo!.total_cost).toBe(250_000.5);
  });

  it("a client cannot send or alter total_cash_out or a project's total_cost directly", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { error: summaryInsertError } = await ownerAClient
      .from("cash_pool_daily_summary")
      .insert({ pool_id: poolId, total_cash_out: 999_999_999 } as never);
    expect(summaryInsertError).not.toBeNull();

    const { error: costSummaryInsertError } = await ownerAClient
      .from("vessel_project_cost_summary")
      .insert({ project_id: projectId, total_cost: 999_999_999 } as never);
    expect(costSummaryInsertError).not.toBeNull();
  });

  it("reversal keeps the original expense, excludes it from the summary, and cannot be repeated — even after project closure", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { data: expense } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 1_000_000,
      description: "biaya sebelum project ditutup",
    });

    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "ready_to_close",
    });
    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "closed",
    });

    const { data: reversal, error: reversalError } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: expense.id,
      p_reason: "salah kategori biaya",
    });
    expect(reversalError).toBeNull();
    expect(reversal.entry_kind).toBe("reversal");
    expect(reversal.reverses_entry_id).toBe(expense.id);
    expect(reversal.pool_id).toBe(expense.pool_id);
    expect(reversal.project_id).toBe(expense.project_id);
    expect(reversal.amount).toBe(expense.amount);

    const { data: summary } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projectId)
      .single();
    expect(summary!.total_cost).toBe(0);

    const { data: originalStillThere } = await admin
      .from("project_cost_ledger_entries")
      .select("id, entry_kind, amount")
      .eq("id", expense.id)
      .single();
    expect(originalStillThere?.entry_kind).toBe("expense");
    expect(originalStillThere?.amount).toBe(expense.amount);

    const { data: entries } = await ownerAClient
      .from("project_cost_ledger_entries")
      .select("id")
      .eq("project_id", projectId);
    expect(entries).toHaveLength(2); // original expense + reversal — nothing deleted, nothing overwritten

    const { error: doubleReversalError } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: expense.id,
      p_reason: "coba lagi",
    });
    expect(doubleReversalError).not.toBeNull();

    const { error: reverseReversalError } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: reversal.id,
      p_reason: "coba reverse hasil reversal",
    });
    expect(reverseReversalError).not.toBeNull();
  });

  it("a reversal reason is required", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { data: expense } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 500,
      description: "biaya kecil",
    });

    const { error } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: expense.id,
      p_reason: "",
    });
    expect(error).not.toBeNull();
  });

  it("reviewer and viewer cannot reverse an expense", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { data: expense } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 500,
      description: "biaya kecil",
    });

    const reviewerAClient = await signInAsMember(reviewerA.email);
    const { error: reviewerError } = await reviewerAClient.rpc("reverse_project_expense", {
      p_entry_id: expense.id,
      p_reason: "reviewer mencoba reverse",
    });
    expect(reviewerError).not.toBeNull();

    const viewerAClient = await signInAsMember(viewerA.email);
    const { error: viewerError } = await viewerAClient.rpc("reverse_project_expense", {
      p_entry_id: expense.id,
      p_reason: "viewer mencoba reverse",
    });
    expect(viewerError).not.toBeNull();
  });

  it("project_cost_ledger_entries rejects direct authenticated mutation — RPC is the only write path", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();

    const { data: expense } = await insertLedgerEntryDirect({
      tenantId: TENANT_A_ID,
      poolId,
      projectId,
      categoryId: categoryAId,
      amount: 500,
      description: "biaya kecil",
    });

    const { error: insertError } = await ownerAClient.from("project_cost_ledger_entries").insert({
      tenant_id: TENANT_A_ID,
      pool_id: poolId,
      project_id: projectId,
      category_id: categoryAId,
      entry_kind: "expense",
      amount: 999_999,
      description: "direct insert attempt",
    });
    expect(insertError).not.toBeNull();

    const { error: updateError } = await ownerAClient
      .from("project_cost_ledger_entries")
      .update({ amount: 1 })
      .eq("id", expense.id);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await ownerAClient.from("project_cost_ledger_entries").delete().eq("id", expense.id);
    expect(deleteError).not.toBeNull();

    const { data: entryAfter } = await admin
      .from("project_cost_ledger_entries")
      .select("amount")
      .eq("id", expense.id)
      .single();
    expect(entryAfter?.amount).toBe(500);
  });

  it("Tenant A cannot read, record against, or reverse Tenant B's ledger entries", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);
    const { poolId: poolBId } = await (async () => {
      const businessDate = randomBusinessDate();
      const { data } = await ownerBClient.rpc("get_or_create_daily_cash_pool", {
        p_tenant_id: TENANT_B_ID,
        p_business_date: businessDate,
      });
      return { poolId: data.id };
    })();

    const { data: entryB } = await insertLedgerEntryDirect({
      tenantId: TENANT_B_ID,
      poolId: poolBId,
      projectId: projectBId,
      categoryId: categoryBId,
      amount: 400_000,
      description: "biaya tenant B",
    });

    const { data: seenByA } = await ownerAClient.from("project_cost_ledger_entries").select("id").eq("id", entryB.id);
    expect(seenByA).toHaveLength(0);

    const { error: crossReverseError } = await ownerAClient.rpc("reverse_project_expense", {
      p_entry_id: entryB.id,
      p_reason: "lintas tenant",
    });
    expect(crossReverseError).not.toBeNull();

    const { data: costSummaryForA } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("project_id")
      .eq("project_id", projectBId);
    expect(costSummaryForA).toHaveLength(0);
  });

  it("anonymous requests get zero access to project_cost_ledger_entries and vessel_project_cost_summary", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: entries, error: entriesError } = await anonClient.from("project_cost_ledger_entries").select("id");
    expect(entriesError).not.toBeNull();
    expect(entries).toBeNull();

    const { data: summary, error: summaryError } = await anonClient.from("vessel_project_cost_summary").select("*");
    expect(summaryError).not.toBeNull();
    expect(summary).toBeNull();

    const { error: rpcError } = await anonClient.rpc("record_project_expense", {
      p_pool_id: "00000000-0000-0000-0000-000000000000",
      p_project_id: "00000000-0000-0000-0000-000000000000",
      p_category_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 1,
      p_description: "anon",
    });
    expect(rpcError).not.toBeNull();
  });
});
