import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. Exercises
// the same RLS-scoped PostgREST/RPC surface the cash-reconciliation
// repository/service layer uses (real authenticated HTTP requests, not
// mocks), same split as expense-approvals.integration.test.ts. Gate 1G.1's
// own end-to-end proof: the unresolved-expense guard on submit/approve, the
// cancel_expense_submission RPC, the defensive recheck at approval, and the
// submit_expense <-> EOD-submit pool-open serialization.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "cash-reconciliation.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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
// reasoning as cost-ledger.integration.test.ts's randomBusinessDate().
function randomBusinessDate(): string {
  const base = Date.UTC(2035, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("unresolved-expense EOD daily-close guard — real local Supabase", () => {
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

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "cr-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "cr-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "cr-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "CR Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "CR Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "CR Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: "cr-anchor-category-a", name: "CR Anchor Category A" })
      .select("id")
      .single();
    categoryAId = categoryA!.id;
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
        start_date: "2035-01-01",
        created_by: ownerA.id,
      })
      .select("id")
      .single();
    createdProjectIds.push(data!.id);
    return data!.id;
  }

  async function createFundedPoolForTenantA(): Promise<{ poolId: string }> {
    const ownerAClient = await signInAsMember(ownerA.email);
    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });
    await ownerAClient.rpc("record_cash_pool_entry", {
      p_pool_id: pool.id,
      p_entry_type: "opening_cash",
      p_amount: 1_000_000,
      p_description: "saldo awal",
    });
    return { poolId: pool.id };
  }

  it("a draft/submitted/needs_correction expense blocks EOD submit; resolving it (cancel) allows submit to succeed", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 50_000,
      p_description: "biaya unresolved",
    });

    const { data: recon } = await ownerAClient.rpc("create_cash_reconciliation_draft", {
      p_pool_id: poolId,
      p_actual_counted_cash: 1_000_000,
      p_explanation: null,
    });

    const { error: blockedByDraftError } = await ownerAClient.rpc("submit_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(blockedByDraftError?.message).toBe("UNRESOLVED_EXPENSES");

    // cancel_expense_submission only accepts draft/needs_correction — submit
    // the draft first to prove the 'submitted' status blocks too, then
    // request correction so it can still be cancelled afterward (cancel
    // never accepts 'submitted' directly).
    await ownerAClient.rpc("submit_expense", { p_submission_id: submission.id });
    const { error: blockedBySubmittedError } = await ownerAClient.rpc("submit_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(blockedBySubmittedError?.message).toBe("UNRESOLVED_EXPENSES");

    await ownerAClient.rpc("request_expense_correction", {
      p_submission_id: submission.id,
      p_reason: "perlu ditinjau ulang",
    });
    const { error: blockedByNeedsCorrectionError } = await ownerAClient.rpc("submit_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(blockedByNeedsCorrectionError?.message).toBe("UNRESOLVED_EXPENSES");

    const { error: cancelError } = await ownerAClient.rpc("cancel_expense_submission", {
      p_submission_id: submission.id,
      p_reason: "dibatalkan agar EOD close bisa dilanjutkan",
    });
    expect(cancelError).toBeNull();

    const { data: submittedRecon, error: submitError } = await ownerAClient.rpc("submit_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(submitError).toBeNull();
    expect(submittedRecon.status).toBe("submitted");

    const { data: pool } = await admin.from("cash_pools").select("daily_close_status").eq("id", poolId).single();
    expect(pool!.daily_close_status).toBe("pending_close");
  });

  it("approve performs a defensive recheck: a stray draft created after submit still blocks approval, and submit_expense is rejected while the pool is pending_close", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const strayProjectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);
    const adminAClient = await signInAsMember(adminA.email);

    const { data: recon } = await ownerAClient.rpc("create_cash_reconciliation_draft", {
      p_pool_id: poolId,
      p_actual_counted_cash: 1_000_000,
      p_explanation: null,
    });
    const { error: submitError } = await ownerAClient.rpc("submit_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(submitError).toBeNull();

    // create_expense_draft is not pool-status gated — a stray draft can still
    // appear while the pool is pending_close.
    const { data: strayDraft } = await adminAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: strayProjectId,
      p_category_id: categoryAId,
      p_amount: 25_000,
      p_description: "biaya stray draft",
    });

    // submit_expense IS pool-status gated (Gate 1G.1's concurrency fix) — it
    // is rejected outright while the pool is pending_close.
    const { error: submitExpenseWhilePendingCloseError } = await adminAClient.rpc("submit_expense", {
      p_submission_id: strayDraft.id,
    });
    expect(submitExpenseWhilePendingCloseError?.message).toContain("cash pool is not open");

    const { error: approveBlockedError } = await ownerAClient.rpc("approve_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(approveBlockedError?.message).toBe("UNRESOLVED_EXPENSES");

    await adminAClient.rpc("cancel_expense_submission", {
      p_submission_id: strayDraft.id,
      p_reason: "dibatalkan agar EOD close bisa dilanjutkan",
    });

    const { data: approved, error: approveError } = await ownerAClient.rpc("approve_cash_reconciliation", {
      p_reconciliation_id: recon.id,
    });
    expect(approveError).toBeNull();
    expect(approved.status).toBe("approved");

    const { data: pool } = await admin.from("cash_pools").select("daily_close_status").eq("id", poolId).single();
    expect(pool!.daily_close_status).toBe("closed");
  });

  it("get_unresolved_expense_count reports the live count and rejects a different tenant's owner", async () => {
    const { poolId } = await createFundedPoolForTenantA();
    const projectId = await createActiveProjectForTenantA();
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);

    const { data: zeroCount } = await ownerAClient.rpc("get_unresolved_expense_count", { p_pool_id: poolId });
    expect(zeroCount).toBe(0);

    const { data: submission } = await ownerAClient.rpc("create_expense_draft", {
      p_tenant_id: TENANT_A_ID,
      p_pool_id: poolId,
      p_project_id: projectId,
      p_category_id: categoryAId,
      p_amount: 30_000,
      p_description: "biaya unresolved count",
    });
    const { data: oneCount } = await ownerAClient.rpc("get_unresolved_expense_count", { p_pool_id: poolId });
    expect(oneCount).toBe(1);

    await ownerAClient.rpc("cancel_expense_submission", {
      p_submission_id: submission.id,
      p_reason: "dibatalkan",
    });
    const { data: backToZero } = await ownerAClient.rpc("get_unresolved_expense_count", { p_pool_id: poolId });
    expect(backToZero).toBe(0);

    const { error: crossTenantError } = await ownerBClient.rpc("get_unresolved_expense_count", {
      p_pool_id: poolId,
    });
    expect(crossTenantError).not.toBeNull();
  });
});
