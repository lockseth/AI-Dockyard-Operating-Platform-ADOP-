import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only. Complements supabase/tests/database/invoice_
// billing_metadata_cardinality.test.sql and invoice_legacy_registration.
// test.sql (which exhaustively prove the business-rule branches at the SQL
// layer) with what pgTAP cannot prove: genuine concurrent HTTP requests
// racing the same invoice_number/legal_entity_id uniqueness constraint and
// the same legacy invoice_number retry (Phase 2A Contract §6.2/§15.8,
// Test Matrix N-03/I-03).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "invoice-billing-metadata.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

const TENANT_ID = "a1111111-1111-4111-8111-111111111111";
const LEGAL_ENTITY_ID = "a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1";

const admin: SupabaseClient = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  role: "owner" | "admin" | "reviewer" | "viewer";
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, {
    emailPrefix: params.emailPrefix,
    memberships: [{ tenantId: TENANT_ID, role: params.role }],
  });
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

describe("invoice billing metadata & cardinality — concurrency, real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let owner: EphemeralMember;

  let clientId: string;
  let vesselId: string;
  let serviceTypeId: string;
  let facilityLocationId: string;
  let categoryId: string;

  beforeAll(async () => {
    owner = await createEphemeralMember({ emailPrefix: "ibm-owner", role: "owner" });
    createdUserIds.push(owner.id);

    const { data: client } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_ID, created_by: owner.id, display_name: "IBM Anchor Client" })
      .select("id")
      .single();
    clientId = client!.id;

    const { data: vessel } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_ID, client_id: clientId, created_by: owner.id, vessel_name: "IBM Anchor Vessel" })
      .select("id")
      .single();
    vesselId = vessel!.id;

    const { data: serviceType } = await admin
      .from("service_types")
      .select("id")
      .eq("tenant_id", TENANT_ID)
      .eq("code", "standard")
      .single();
    serviceTypeId = serviceType!.id;

    const { data: facilityLocation } = await admin
      .from("facility_locations")
      .insert({ tenant_id: TENANT_ID, name: "IBM Anchor Facility" })
      .select("id")
      .single();
    facilityLocationId = facilityLocation!.id;

    const { data: category } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_ID, code: `ibm-anchor-category-${crypto.randomUUID()}`, name: "IBM Anchor Category" })
      .select("id")
      .single();
    categoryId = category!.id;
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    await admin.from("expense_categories").delete().eq("id", categoryId);
    await admin.from("facility_locations").delete().eq("id", facilityLocationId);
    await admin.from("vessels").delete().eq("id", vesselId);
    await admin.from("clients").delete().eq("id", clientId);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function createClosedProject(): Promise<string> {
    const { data: project } = await admin
      .from("vessel_projects")
      .insert({
        tenant_id: TENANT_ID,
        vessel_id: vesselId,
        client_id: clientId,
        service_type_id: serviceTypeId,
        facility_location_id: facilityLocationId,
        start_date: "2033-01-01",
        created_by: owner.id,
      })
      .select("id")
      .single();
    const projectId = project!.id;
    createdProjectIds.push(projectId);

    const ownerClient = await signInAsMember(owner.email);
    await ownerClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "ready_to_close",
    });
    await ownerClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "closed",
    });

    return projectId;
  }

  it("N-03: concurrent register_invoice_number calls with the same number in the same legal entity — exactly one succeeds", async () => {
    const ownerClient = await signInAsMember(owner.email);
    const [projectOne, projectTwo] = await Promise.all([createClosedProject(), createClosedProject()]);

    const { data: invoiceOne } = await ownerClient.rpc("create_draft_invoice", {
      p_tenant_id: TENANT_ID,
      p_project_id: projectOne,
    });
    const { data: invoiceTwo } = await ownerClient.rpc("create_draft_invoice", {
      p_tenant_id: TENANT_ID,
      p_project_id: projectTwo,
    });

    // The uniqueness race only exists within the SAME legal entity — a null
    // legal_entity_id would trivially not conflict with itself (SQL NULL is
    // never equal to NULL), so both invoices must share one first.
    await ownerClient.rpc("update_invoice_billing_metadata", {
      p_invoice_id: invoiceOne.id,
      p_legal_entity_id: LEGAL_ENTITY_ID,
      p_invoice_date: null,
      p_due_date: null,
    });
    await ownerClient.rpc("update_invoice_billing_metadata", {
      p_invoice_id: invoiceTwo.id,
      p_legal_entity_id: LEGAL_ENTITY_ID,
      p_invoice_date: null,
      p_due_date: null,
    });

    const sharedNumber = `IBM-RACE-${crypto.randomUUID()}`;

    const [first, second] = await Promise.all([
      ownerClient.rpc("register_invoice_number", { p_invoice_id: invoiceOne.id, p_invoice_number: sharedNumber }),
      ownerClient.rpc("register_invoice_number", { p_invoice_id: invoiceTwo.id, p_invoice_number: sharedNumber }),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error !== null)).toHaveLength(1);

    const { count } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID)
      .eq("legal_entity_id", LEGAL_ENTITY_ID)
      .eq("invoice_number", sharedNumber);
    expect(count).toBe(1);
  });

  it("I-03: concurrent register_legacy_invoice retries with the same source number — exactly one succeeds, no duplicate Billing Record", async () => {
    const ownerClient = await signInAsMember(owner.email);
    const projectId = await createClosedProject();
    const legacyNumber = `IBM-LEGACY-RACE-${crypto.randomUUID()}`;

    const registerOnce = () =>
      ownerClient.rpc("register_legacy_invoice", {
        p_tenant_id: TENANT_ID,
        p_legal_entity_id: LEGAL_ENTITY_ID,
        p_project_id: projectId,
        p_invoice_number: legacyNumber,
        p_invoice_date: "2029-01-01",
        p_due_date: null,
        p_status: "issued",
        p_legacy_coverage_status: "unknown",
        p_void_reason: null,
        p_transaction_entry_ids: null,
      });

    const [first, second] = await Promise.all([registerOnce(), registerOnce()]);

    const results = [first, second];
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error !== null)).toHaveLength(1);

    const { count } = await admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID)
      .eq("legal_entity_id", LEGAL_ENTITY_ID)
      .eq("invoice_number", legacyNumber);
    expect(count).toBe(1);
  });
});
