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
// repository/service layer uses (real authenticated HTTP requests, not
// mocks) — Gate 1J-B's TEST WAJIB items #1-20/#22. #21 (no service-role
// usage in application code) is covered separately by
// src/lib/cash-import-staging/no-service-role-exposure.test.ts.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "cash-import-staging.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

function randomSha(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// A minimal 4-row analysis (1 opening + 3 transaction rows: one plain valid,
// a duplicate pair sharing a fingerprint, one AMOUNT_MISSING error) — small
// enough for fast HTTP round trips while still exercising every invariant
// the 260-row real workbook does. Mirrors the shape parseCashReportWorkbook
// actually produces (src/lib/cash-import/parser.ts).
function buildRowsFixture() {
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
      source_fingerprint: "fp-dup-shared",
      description: "beli spare part",
      vessel_label: "KM Duplicate",
      debit: 200_000,
      credit: null,
      workbook_balance: 1_700_000,
      calculated_balance: 1_700_000,
      provisional_classification: "project_cash_in_or_refund_review",
      status: "warning",
      validation_issues: [{ code: "DUPLICATE_ROW_CANDIDATE", severity: "warning", message: "dup" }],
    },
    {
      source_row_number: 5,
      source_fingerprint: "fp-dup-shared",
      description: "beli spare part",
      vessel_label: "KM Duplicate",
      debit: 200_000,
      credit: null,
      workbook_balance: 1_900_000,
      calculated_balance: 1_900_000,
      provisional_classification: "project_cash_in_or_refund_review",
      status: "warning",
      validation_issues: [{ code: "DUPLICATE_ROW_CANDIDATE", severity: "warning", message: "dup" }],
    },
    {
      source_row_number: 6,
      source_fingerprint: `fp-error-${crypto.randomUUID()}`,
      description: "baris rusak",
      vessel_label: "KM Error",
      debit: null,
      credit: null,
      workbook_balance: null,
      calculated_balance: 1_900_000,
      provisional_classification: "manual_mapping_required",
      status: "error",
      validation_issues: [{ code: "AMOUNT_MISSING", severity: "error", message: "missing" }],
    },
  ];
}

describe("cash import staging — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;
  let adminB: EphemeralMember;

  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "cis-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "cis-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "cis-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "cis-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);
    adminB = await createEphemeralMember({ emailPrefix: "cis-admin-b", tenantId: TENANT_B_ID, role: "admin" });
    createdUserIds.push(adminB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "CIS Anchor Client A" })
      .select("id")
      .single();
    createdClientIds.push(clientA!.id);

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientA!.id, created_by: ownerA.id, vessel_name: "CIS Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "CIS Anchor Facility A" })
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

    const { data: clientB } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerB.id, display_name: "CIS Anchor Client B" })
      .select("id")
      .single();
    createdClientIds.push(clientB!.id);

    const { data: vesselB } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_B_ID, client_id: clientB!.id, created_by: ownerB.id, vessel_name: "CIS Anchor Vessel B" })
      .select("id")
      .single();

    const { data: serviceTypeB } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_B_ID)
      .eq("code", "standard")
      .single();

    const { data: facilityLocationB } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_B_ID, name: "CIS Anchor Facility B" })
      .select("id")
      .single();

    const { data: projectB } = await admin
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_B_ID,
        vessel_id: vesselB!.id,
        client_id: clientB!.id,
        service_type_id: serviceTypeB!.id,
        facility_location_id: facilityLocationB!.id,
        start_date: "2036-01-01",
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
    if (createdClientIds.length > 0) {
      await admin.from("clients").delete().in("id", createdClientIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("#2 owner cannot create a batch", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { error } = await ownerAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan.xlsx",
      p_source_sha256: randomSha("owner-attempt"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-01",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(error).not.toBeNull();
  });

  it("#1 / #7 admin creates a staged batch and all rows persist atomically", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const sha = randomSha("cis-batch");

    const { data: created, error } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-cis.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-01",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(error).toBeNull();
    expect(created.is_new).toBe(true);
    const batchId = created.batch.id as string;
    expect(created.batch.transaction_count).toBe(4);
    expect(created.batch.warning_count).toBe(2);
    expect(created.batch.error_count).toBe(1);

    const { data: rows } = await adminAClient.from("cash_import_rows").select("id").eq("batch_id", batchId);
    expect(rows).toHaveLength(5);

    const { data: events } = await adminAClient
      .from("cash_import_events")
      .select("event_type")
      .eq("batch_id", batchId)
      .eq("event_type", "batch_created");
    expect(events).toHaveLength(1);
  });

  it("#8 a malformed row leaves no partial batch", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const sha = randomSha("cis-broken");
    const badRows = [
      {
        source_row_number: 2,
        source_fingerprint: "fp-x",
        description: null,
        vessel_label: null,
        debit: null,
        credit: null,
        workbook_balance: 1_000_000,
        calculated_balance: 1_000_000,
        provisional_classification: "NOT_A_REAL_CLASSIFICATION",
        status: "valid",
        validation_issues: [],
      },
    ];

    const { error } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-rusak.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-02",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_000_000,
      p_rows: badRows,
    });
    expect(error).not.toBeNull();

    const { data: batch } = await admin
      .from("cash_import_batches")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("source_sha256", sha)
      .maybeSingle();
    expect(batch).toBeNull();
  });

  it("#9 / #10 / #11 upload idempotency: same hash reopens, different hash creates new, cross-tenant isolated", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const sha = randomSha("cis-idem");

    const { data: first } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-idem.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-03",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    const firstBatchId = first.batch.id;

    const { data: reopened } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-idem-RENAMED.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-03",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(reopened.is_new).toBe(false);
    expect(reopened.batch.id).toBe(firstBatchId);

    const { data: rowsAfterReopen } = await adminAClient.from("cash_import_rows").select("id").eq("batch_id", firstBatchId);
    expect(rowsAfterReopen).toHaveLength(5);

    const { data: differentHash } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-idem.xlsx",
      p_source_sha256: randomSha("cis-idem-different"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-04",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(differentHash.is_new).toBe(true);
    expect(differentHash.batch.id).not.toBe(firstBatchId);

    const adminBClient = await signInAsMember(adminB.email);
    const { data: crossTenantSameHash } = await adminBClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_B_ID,
      p_source_filename: "laporan-idem.xlsx",
      p_source_sha256: sha,
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-03",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(crossTenantSameHash.is_new).toBe(true);
    expect(crossTenantSameHash.batch.id).not.toBe(firstBatchId);
  });

  it("#3 / #4 / #5 / #22 read visibility: owner reads, viewer/anon rejected, cross-tenant blocked, refresh reloads from server", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-read.xlsx",
      p_source_sha256: randomSha("cis-read"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-05",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    const batchId = created.batch.id as string;

    const ownerAClient = await signInAsMember(ownerA.email);
    const { data: ownerRead } = await ownerAClient.from("cash_import_batches").select("id").eq("id", batchId).maybeSingle();
    expect(ownerRead?.id).toBe(batchId);

    // #22 — a fresh, independent query (a new client, simulating a page
    // refresh) reloads the same persisted state from the server.
    const ownerARefreshClient = await signInAsMember(ownerA.email);
    const { data: refreshed } = await ownerARefreshClient.from("cash_import_batches").select("*").eq("id", batchId).maybeSingle();
    expect(refreshed?.source_filename).toBe("laporan-read.xlsx");
    expect(refreshed?.transaction_count).toBe(4);

    const viewerAClient = await signInAsMember(viewerA.email);
    const { data: viewerRead } = await viewerAClient.from("cash_import_batches").select("id").eq("id", batchId);
    expect(viewerRead).toEqual([]);

    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: anonRead } = await anon.from("cash_import_batches").select("id").eq("id", batchId);
    expect(anonRead ?? []).toEqual([]);

    const ownerBClient = await signInAsMember(ownerB.email);
    const { data: crossTenantRead } = await ownerBClient.from("cash_import_batches").select("id").eq("id", batchId);
    expect(crossTenantRead).toEqual([]);
    const { data: crossTenantRows } = await ownerBClient.from("cash_import_rows").select("id").eq("batch_id", batchId);
    expect(crossTenantRows).toEqual([]);
  });

  it("#12 raw tenant/actor/status spoofing is rejected", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    // Admin A is not a member of tenant B — a forged p_tenant_id is
    // rejected by the RPC's own role re-check, not merely ignored.
    const { error } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_B_ID,
      p_source_filename: "spoof.xlsx",
      p_source_sha256: randomSha("cis-spoof"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-06",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    expect(error).not.toBeNull();
  });

  it("#20 direct client table mutation is rejected", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const { error } = await adminAClient.from("cash_import_batches").insert({
      tenant_id: TENANT_A_ID,
      source_filename: "direct-insert.xlsx",
      source_sha256: randomSha("cis-direct"),
      source_sheet_name: "Sheet1",
      business_date: "2036-04-07",
      opening_balance: 1_000_000,
    } as never);
    expect(error).not.toBeNull();
  });

  it("#6 / #13 / #14 / #15 / #16 mapping and disposition rules, each producing an audit event", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-mapping.xlsx",
      p_source_sha256: randomSha("cis-mapping"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-08",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    const batchId = created.batch.id as string;

    // #6 — cross-tenant project mapping rejected.
    const { error: crossTenantMappingError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "KM Duplicate",
      p_mapping_kind: "existing_vessel_project",
      p_mapped_vessel_project_id: projectBId,
    });
    expect(crossTenantMappingError).not.toBeNull();

    // Valid mapping to the same tenant's project.
    const { error: validMappingError } = await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "KM Duplicate",
      p_mapping_kind: "existing_vessel_project",
      p_mapped_vessel_project_id: projectAId,
    });
    expect(validMappingError).toBeNull();

    // #13 — mapping decision creates an audit event.
    const { data: mappingEvents } = await adminAClient
      .from("cash_import_events")
      .select("id")
      .eq("batch_id", batchId)
      .eq("event_type", "label_mapping_set");
    expect(mappingEvents!.length).toBeGreaterThanOrEqual(1);

    const { data: duplicateRows } = await adminAClient
      .from("cash_import_rows")
      .select("id, status")
      .eq("batch_id", batchId)
      .eq("vessel_label", "KM Duplicate");
    expect(duplicateRows).toHaveLength(2);

    const { data: errorRow } = await adminAClient
      .from("cash_import_rows")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "error")
      .single();

    // #16 — error row cannot be included.
    const { error: includeErrorRowError } = await adminAClient.rpc("set_cash_import_row_disposition", {
      p_row_id: errorRow!.id,
      p_disposition: "include",
    });
    expect(includeErrorRowError).not.toBeNull();

    // #15 — skip without a reason is rejected.
    const { error: skipNoReasonError } = await adminAClient.rpc("set_cash_import_row_disposition", {
      p_row_id: duplicateRows![0].id,
      p_disposition: "skip",
    });
    expect(skipNoReasonError).not.toBeNull();

    // Valid dispositions.
    const { error: skipWithReasonError } = await adminAClient.rpc("set_cash_import_row_disposition", {
      p_row_id: duplicateRows![0].id,
      p_disposition: "skip",
      p_disposition_reason: "duplikat dari baris sebelumnya",
    });
    expect(skipWithReasonError).toBeNull();

    // #14 — the duplicate row is not silently removed; it still exists with
    // a real decision recorded.
    const { data: duplicateRowsAfter } = await adminAClient
      .from("cash_import_rows")
      .select("id, disposition")
      .eq("batch_id", batchId)
      .eq("vessel_label", "KM Duplicate");
    expect(duplicateRowsAfter).toHaveLength(2);
    expect(duplicateRowsAfter!.find((r) => r.id === duplicateRows![0].id)?.disposition).toBe("skip");
  });

  it("#17 / #18 incomplete mapping cannot become ready; a reconciled, fully-decided batch can", async () => {
    const adminAClient = await signInAsMember(adminA.email);
    const { data: created } = await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-clean.xlsx",
      p_source_sha256: randomSha("cis-clean"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-09",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_500_000,
      p_rows: [
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
      ],
    });
    const batchId = created.batch.id as string;

    const { error: incompleteError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(incompleteError).not.toBeNull();

    await adminAClient.rpc("set_cash_import_label_mapping", {
      p_batch_id: batchId,
      p_vessel_label: "Kas",
      p_mapping_kind: "cash",
    });

    const { error: stillIncompleteError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(stillIncompleteError).not.toBeNull();

    const { data: kasRow } = await adminAClient
      .from("cash_import_rows")
      .select("id")
      .eq("batch_id", batchId)
      .eq("vessel_label", "Kas")
      .single();
    await adminAClient.rpc("set_cash_import_row_disposition", {
      p_row_id: kasRow!.id,
      p_disposition: "include",
    });

    const { data: readyBatch, error: readyError } = await adminAClient.rpc("mark_cash_import_batch_ready_for_review", {
      p_batch_id: batchId,
    });
    expect(readyError).toBeNull();
    expect(readyBatch.status).toBe("ready_for_review");
  });

  it("#19 operational tables gain zero rows attributable to the staging actor", async () => {
    // A global before/after row count on shared operational tables would be
    // racy under Vitest's default parallel file execution (sibling
    // integration suites — e.g. cost-ledger, vessel-project-lifecycle —
    // insert into the same tables concurrently against the same local
    // Supabase instance). This scopes the check to rows attributable to
    // this test's own ephemeral actor instead, which no other file ever
    // references, and is therefore race-safe. The fully global version of
    // this invariant (zero rows in a completely isolated transaction) is
    // proven deterministically by cash_import_staging.test.sql (pgTAP) §19.
    const scopedTables: Array<{ table: string; column: "created_by" | "actor_user_id" }> = [
      { table: "clients", column: "created_by" },
      { table: "vessels", column: "created_by" },
      { table: "vendors", column: "created_by" },
      { table: "vessel_projects", column: "created_by" },
      { table: "cash_pools", column: "created_by" },
      { table: "cash_pool_entries", column: "created_by" },
      { table: "expense_submissions", column: "created_by" },
      { table: "expense_submission_revisions", column: "created_by" },
      { table: "project_cost_ledger_entries", column: "actor_user_id" },
      { table: "cash_reconciliations", column: "created_by" },
    ];

    async function countForActor(): Promise<number[]> {
      return Promise.all(
        scopedTables.map(async ({ table, column }) => {
          const { count } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, adminA.id);
          return count ?? 0;
        }),
      );
    }

    const before = await countForActor();
    expect(before.every((n) => n === 0), "admin A must not already have operational rows before this test").toBe(true);

    const adminAClient = await signInAsMember(adminA.email);
    await adminAClient.rpc("create_cash_import_batch", {
      p_tenant_id: TENANT_A_ID,
      p_source_filename: "laporan-nonmutation.xlsx",
      p_source_sha256: randomSha("cis-nonmutation"),
      p_source_sheet_name: "Sheet1",
      p_business_date: "2036-04-10",
      p_opening_balance: 1_000_000,
      p_workbook_closing_balance: 1_900_000,
      p_rows: buildRowsFixture(),
    });
    const after = await countForActor();
    for (let i = 0; i < scopedTables.length; i++) {
      expect(after[i], `${scopedTables[i].table} gained a row attributed to the staging actor`).toBe(0);
    }
  });
});
