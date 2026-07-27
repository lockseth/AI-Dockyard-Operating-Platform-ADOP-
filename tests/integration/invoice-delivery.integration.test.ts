import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only. Complements supabase/tests/database/invoice_
// delivery_acknowledgment.test.sql (which exhaustively proves the
// business-rule branches at the SQL layer) with what pgTAP cannot prove:
// genuine concurrent HTTP requests racing the same invoice's delivery log.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "invoice-delivery.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";
const TENANT_B_ID = "b2222222-2222-4222-8222-222222222222";
const LEGAL_ENTITY_A_ID = "a1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1";

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

function randomBusinessDate(): string {
  const base = Date.UTC(2033, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("invoice delivery & acknowledgment — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let clientAId: string;
  let vesselAId: string;
  let serviceTypeAId: string;
  let facilityLocationAId: string;
  let categoryAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "id-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "id-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "id-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "ID Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "ID Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "ID Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: `id-anchor-category-a-${crypto.randomUUID()}`, name: "ID Anchor Category A" })
      .select("id")
      .single();
    categoryAId = categoryA!.id;
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await admin.from("vessel_projects").delete().in("id", createdProjectIds);
    }
    await admin.from("expense_categories").delete().eq("id", categoryAId);
    await admin.from("facility_locations").delete().eq("id", facilityLocationAId);
    await admin.from("vessels").delete().eq("id", vesselAId);
    await admin.from("clients").delete().eq("id", clientAId);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function createIssuedInvoice(): Promise<string> {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: project } = await admin
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
    const projectId = project!.id;
    createdProjectIds.push(projectId);

    const businessDate = randomBusinessDate();
    const { data: pool } = await ownerAClient.rpc("get_or_create_daily_cash_pool", {
      p_tenant_id: TENANT_A_ID,
      p_business_date: businessDate,
    });

    const { data: entry, error: entryError } = await admin
      .from("project_cost_ledger_entries")
      .insert({
        tenant_id: TENANT_A_ID,
        pool_id: pool.id,
        project_id: projectId,
        category_id: categoryAId,
        entry_kind: "expense",
        amount: 250_000,
        description: "ID bindable expense",
      })
      .select("id")
      .single();
    if (entryError) throw entryError;

    await ownerAClient.rpc("transition_vessel_project_lifecycle", { p_project_id: projectId, p_to_status: "ready_to_close" });
    await ownerAClient.rpc("transition_vessel_project_lifecycle", { p_project_id: projectId, p_to_status: "closed" });

    const { data: invoice, error: createError } = await ownerAClient.rpc("create_draft_invoice", {
      p_tenant_id: TENANT_A_ID,
      p_project_id: projectId,
    });
    if (createError) throw createError;

    const { error: bindError } = await ownerAClient.rpc("bind_invoice_transaction", {
      p_invoice_id: invoice.id,
      p_transaction_entry_id: entry!.id,
    });
    if (bindError) throw bindError;

    const { error: metadataError } = await ownerAClient.rpc("update_invoice_billing_metadata", {
      p_invoice_id: invoice.id,
      p_legal_entity_id: LEGAL_ENTITY_A_ID,
      p_invoice_date: "2033-01-05",
      p_due_date: "2033-02-04",
    });
    if (metadataError) throw metadataError;

    const { error: numberError } = await ownerAClient.rpc("register_invoice_number", {
      p_invoice_id: invoice.id,
      p_invoice_number: `ID-${crypto.randomUUID()}`,
    });
    if (numberError) throw numberError;

    const { error: issueError } = await ownerAClient.rpc("issue_invoice", { p_invoice_id: invoice.id });
    if (issueError) throw issueError;

    return invoice.id;
  }

  it("golden path over real HTTP: sent -> delivered -> acknowledged, each read back with actor/timestamp", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const invoiceId = await createIssuedInvoice();

    const sent = await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });
    expect(sent.error).toBeNull();

    const delivered = await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "delivered",
      p_recipient_snapshot: "pic@client.co",
    });
    expect(delivered.error).toBeNull();

    const acknowledged = await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "manual",
      p_event_type: "acknowledged",
      p_recipient_snapshot: "Pak Budi (PIC Finance)",
      p_acknowledgment_note: "Dikonfirmasi lewat telepon",
    });
    expect(acknowledged.error).toBeNull();
    expect(acknowledged.data.event_type).toBe("acknowledged");
    expect(acknowledged.data.recorded_by).toBe(ownerA.id);
    expect(acknowledged.data.created_at).toBeTruthy();
    expect(acknowledged.data.acknowledgment_note).toBe("Dikonfirmasi lewat telepon");

    const { data: history, error: historyError } = await ownerAClient
      .from("invoice_delivery_events")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("event_seq", { ascending: true });
    expect(historyError).toBeNull();
    expect(history?.map((row) => row.event_type)).toEqual(["sent", "delivered", "acknowledged"]);
  });

  it("draft invoice rejects delivery recording over real HTTP", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: project } = await admin
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
    createdProjectIds.push(project!.id);

    const { data: draftInvoice, error: createError } = await ownerAClient.rpc("create_draft_invoice", {
      p_tenant_id: TENANT_A_ID,
      p_project_id: project!.id,
    });
    expect(createError).toBeNull();

    const { error } = await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: draftInvoice.id,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/invoice must be issued/);
  });

  it("cross-tenant: owner B cannot record or read owner A's invoice delivery events", async () => {
    const ownerBClient = await signInAsMember(ownerB.email);
    const invoiceId = await createIssuedInvoice();

    const { error: writeError } = await ownerBClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });
    expect(writeError).not.toBeNull();

    const ownerAClient = await signInAsMember(ownerA.email);
    await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });

    const { data: crossTenantRead, error: readError } = await ownerBClient
      .from("invoice_delivery_events")
      .select("id")
      .eq("invoice_id", invoiceId);
    expect(readError).toBeNull();
    expect(crossTenantRead).toEqual([]);
  });

  it("reviewer cannot record a delivery event (owner/admin only)", async () => {
    const reviewerAClient = await signInAsMember(reviewerA.email);
    const invoiceId = await createIssuedInvoice();

    const { error } = await reviewerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not authorized/);
  });

  it("concurrent identical 'Catat Pengiriman' submissions race safely: exactly one row is recorded, not two", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const invoiceId = await createIssuedInvoice();

    const [first, second] = await Promise.all([
      ownerAClient.rpc("record_invoice_delivery_event", {
        p_invoice_id: invoiceId,
        p_channel: "whatsapp",
        p_event_type: "sent",
        p_recipient_snapshot: "0812xxxx",
      }),
      ownerAClient.rpc("record_invoice_delivery_event", {
        p_invoice_id: invoiceId,
        p_channel: "whatsapp",
        p_event_type: "sent",
        p_recipient_snapshot: "0812xxxx",
      }),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const { count } = await admin
      .from("invoice_delivery_events")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId);
    expect(count).toBe(1);
  });

  it("append-only: a raw UPDATE/DELETE against invoice_delivery_events is rejected even for the service-role admin client", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const invoiceId = await createIssuedInvoice();
    await ownerAClient.rpc("record_invoice_delivery_event", {
      p_invoice_id: invoiceId,
      p_channel: "email",
      p_event_type: "sent",
      p_recipient_snapshot: "pic@client.co",
    });

    const { error: updateError } = await admin
      .from("invoice_delivery_events")
      .update({ recipient_snapshot: "tampered" })
      .eq("invoice_id", invoiceId);
    expect(updateError).not.toBeNull();

    const { error: deleteError } = await admin.from("invoice_delivery_events").delete().eq("invoice_id", invoiceId);
    expect(deleteError).not.toBeNull();
  });
});
