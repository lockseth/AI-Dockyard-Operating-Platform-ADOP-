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
// repository/service layer uses for Gate 6I-A's candidate-project creation
// (auto_apply_cash_import_batch_dispositions / approve_and_commit_cash_
// import_batch's candidate loop, 20260729020000_import_candidate_projects_
// and_exception_review.sql). This file focuses on what genuinely needs a
// real HTTP round trip and true concurrency — every deterministic business
// rule (auto-disposition eligibility, candidate plan capture/cleanup,
// CANDIDATE_PLAN_INCOMPLETE/MISSING gates, atomic rollback, draft lifecycle)
// already has an exhaustive proof in
// supabase/tests/database/import_candidate_projects_and_exception_review.test.sql.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "cash-import-candidate-project-approval.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";

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
// business_date collision would be a false failure, not a real bug.
function randomBusinessDate(): string {
  const base = Date.UTC(2032, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// One opening row + one Kas top-up + two rows sharing ONE candidate vessel
// label (an expense and a refund) — enough to prove both "one candidate per
// label, not per row" and the candidate posting shape in one batch.
function buildCandidateRowsFixture(vesselLabel: string) {
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
      source_fingerprint: `fp-cand-expense-${crypto.randomUUID()}`,
      description: "beli spare part",
      vessel_label: vesselLabel,
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
      source_fingerprint: `fp-cand-refund-${crypto.randomUUID()}`,
      description: "pengembalian sisa material",
      vessel_label: vesselLabel,
      debit: 30_000,
      credit: null,
      workbook_balance: 1_330_000,
      calculated_balance: 1_330_000,
      provisional_classification: "project_cash_in_or_refund_review",
      status: "valid",
      validation_issues: [],
    },
  ];
}

describe("cash import candidate project approval — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let clientAId: string;
  let serviceTypeAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "cicpa-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "cicpa-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "CICPA Candidate Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;
    createdClientIds.push(clientAId);

    const { data: serviceTypeA } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("code", "standard")
      .single();
    serviceTypeAId = serviceTypeA!.id;
  });

  afterAll(async () => {
    // Candidate vessels/projects created by these tests point at clientAId
    // — cascade-clean via that fan-out before removing the client/users.
    const { data: vessels } = await admin.from("vessels").select("id").eq("client_id", clientAId);
    const vesselIds = (vessels ?? []).map((v) => v.id as string);
    if (vesselIds.length > 0) {
      await admin.from("vessel_projects").delete().in("vessel_id", vesselIds);
      await admin.from("vessels").delete().in("id", vesselIds);
    }
    if (createdClientIds.length > 0) {
      await admin.from("clients").delete().in("id", createdClientIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function stageReadyBatchWithCandidate(businessDate: string, sha: string, vesselLabel: string) {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created, error: createError } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-cicpa.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: businessDate,
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_330_000,
      p_rows: buildCandidateRowsFixture(vesselLabel),
    });
    expect(createError).toBeNull();
    const batchId = created.batch.id as string;

    const { error: kasMapError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "Kas",
      p_mapping_kind: "cash",
    });
    expect(kasMapError).toBeNull();

    const { error: candidateMapError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: vesselLabel,
      p_mapping_kind: "new_project_candidate",
      p_candidate_vessel_name: vesselLabel,
      p_candidate_client_id: clientAId,
      p_candidate_service_type_id: serviceTypeAId,
      p_candidate_start_date: businessDate,
    });
    expect(candidateMapError).toBeNull();

    // Exception-only auto-disposition, via the real RPC end to end — every
    // non-opening row here is unambiguous (Kas mapped cash, candidate label
    // mapped with a complete plan), so this alone should include all three.
    const { data: autoApplyResult, error: autoApplyError } = await adminAClient.rpc(
      "auto_apply_cash_import_batch_dispositions",
      { p_batch_id: batchId },
    );
    expect(autoApplyError).toBeNull();
    expect(autoApplyResult.auto_included_count).toBe(3);
    expect(autoApplyResult.manual_review_count).toBe(0);

    const { data: ready, error: readyError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(readyError).toBeNull();
    expect(ready.status).toBe("ready_for_review");

    return batchId;
  }

  it("full happy path: auto-apply -> ready-for-review -> owner approval creates exactly one draft vessel+project via real RLS-scoped reads", async () => {
    const businessDate = randomBusinessDate();
    const vesselLabel = `KM CICPA Happy ${crypto.randomUUID().slice(0, 8)}`;
    const batchId = await stageReadyBatchWithCandidate(businessDate, randomSha("cicpa-happy"), vesselLabel);

    // Candidate vessel/project must not exist before approval.
    const { data: vesselsBefore } = await admin.from("vessels").select("id").eq("vessel_name", vesselLabel);
    expect(vesselsBefore).toEqual([]);

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: committed, error: approveError } = await ownerAClient.rpc("approve_and_commit_cash_import_batch", {
      p_batch_id: batchId,
    });
    expect(approveError).toBeNull();
    expect(committed.status).toBe("committed");

    const { data: vesselsAfter } = await ownerAClient
      .from("vessels")
      .select("id, client_id, vessel_name")
      .eq("vessel_name", vesselLabel);
    expect(vesselsAfter).toHaveLength(1);
    expect(vesselsAfter![0].client_id).toBe(clientAId);

    const { data: projects } = await ownerAClient
      .from("vessel_projects")
      .select("id, lifecycle_status, service_type_id, start_date")
      .eq("vessel_id", vesselsAfter![0].id);
    expect(projects).toHaveLength(1);
    expect(projects![0].lifecycle_status).toBe("draft");
    expect(projects![0].service_type_id).toBe(serviceTypeAId);

    const { data: plan } = await ownerAClient
      .from("cash_import_candidate_plans")
      .select("resolved_vessel_id, resolved_project_id")
      .eq("batch_id", batchId)
      .single();
    expect(plan!.resolved_vessel_id).toBe(vesselsAfter![0].id);
    expect(plan!.resolved_project_id).toBe(projects![0].id);

    // The candidate's expense/refund actually posted against the new project.
    const { data: costSummary } = await ownerAClient
      .from("vessel_project_cost_summary")
      .select("total_cost")
      .eq("project_id", projects![0].id)
      .single();
    expect(Number(costSummary!.total_cost)).toBe(170_000); // 200,000 expense - 30,000 refund
  });

  it("concurrent approval: two simultaneous approve calls on the same candidate-carrying batch create exactly one vessel and one project, never two", async () => {
    const businessDate = randomBusinessDate();
    const vesselLabel = `KM CICPA Concurrent ${crypto.randomUUID().slice(0, 8)}`;
    const batchId = await stageReadyBatchWithCandidate(businessDate, randomSha("cicpa-concurrent"), vesselLabel);

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

    const { count: vesselCount } = await admin
      .from("vessels")
      .select("id", { count: "exact", head: true })
      .eq("vessel_name", vesselLabel);
    expect(vesselCount).toBe(1);

    const { data: vessel } = await admin.from("vessels").select("id").eq("vessel_name", vesselLabel).single();
    const { count: projectCount } = await admin
      .from("vessel_projects")
      .select("id", { count: "exact", head: true })
      .eq("vessel_id", vessel!.id);
    expect(projectCount).toBe(1);
  });
});
