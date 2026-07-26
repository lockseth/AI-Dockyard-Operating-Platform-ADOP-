import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only. Complements supabase/tests/database/invoice_
// evidence_binding.test.sql (which exhaustively proves the business-rule
// branches at the SQL layer) with what pgTAP cannot prove: genuine
// concurrent HTTP requests racing the same row, and a real Storage API
// upload exercising the bucket's RLS policies end-to-end (not a fixture
// row inserted directly into storage.objects).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "invoice-evidence.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

function randomBusinessDate(): string {
  const base = Date.UTC(2033, 0, 1);
  const offsetDays = Math.floor(Math.random() * 20_000);
  return new Date(base + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

describe("invoice evidence & signed document foundation — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  let clientAId: string;
  let vesselAId: string;
  let serviceTypeAId: string;
  let facilityLocationAId: string;
  let categoryAId: string;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "ie-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "ie-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "ie-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "ie-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);

    const { data: clientA } = await admin
      .from("clients")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "IE Anchor Client A" })
      .select("id")
      .single();
    clientAId = clientA!.id;

    const { data: vesselA } = await admin
      .from("vessels")
      .insert({ tenant_id: TENANT_A_ID, client_id: clientAId, created_by: ownerA.id, vessel_name: "IE Anchor Vessel A" })
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
      .insert({ tenant_id: TENANT_A_ID, name: "IE Anchor Facility A" })
      .select("id")
      .single();
    facilityLocationAId = facilityLocationA!.id;

    const { data: categoryA } = await admin
      .from("expense_categories")
      .insert({ tenant_id: TENANT_A_ID, code: `ie-anchor-category-a-${crypto.randomUUID()}`, name: "IE Anchor Category A" })
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

  // Builds one closed Project Kapal with N bindable expense entries, ready
  // to be turned into an invoice by the tests below.
  async function createClosedProjectWithEntries(count: number): Promise<{ projectId: string; entryIds: string[] }> {
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

    const entryIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const { data: entry, error } = await admin
        .from("project_cost_ledger_entries")
        .insert({
          tenant_id: TENANT_A_ID,
          pool_id: pool.id,
          project_id: projectId,
          category_id: categoryAId,
          entry_kind: "expense",
          amount: 100_000 + i,
          description: `IE bindable expense ${i}`,
        })
        .select("id")
        .single();
      if (error) throw error;
      entryIds.push(entry!.id);
    }

    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "ready_to_close",
    });
    await ownerAClient.rpc("transition_vessel_project_lifecycle", {
      p_project_id: projectId,
      p_to_status: "closed",
    });

    return { projectId, entryIds };
  }

  async function createIssuedInvoice(entryCount: number): Promise<string> {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { entryIds } = await createClosedProjectWithEntries(entryCount);

    const { data: invoice, error: createError } = await ownerAClient.rpc("create_draft_invoice", {
      p_tenant_id: TENANT_A_ID,
    });
    if (createError) throw createError;

    for (const entryId of entryIds) {
      const { error: bindError } = await ownerAClient.rpc("bind_invoice_transaction", {
        p_invoice_id: invoice.id,
        p_transaction_entry_id: entryId,
      });
      if (bindError) throw bindError;
    }

    const { error: issueError } = await ownerAClient.rpc("issue_invoice", { p_invoice_id: invoice.id });
    if (issueError) throw issueError;

    return invoice.id;
  }

  it("concurrent issue_invoice calls on the same draft invoice: exactly one succeeds, one audit event is recorded", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { entryIds } = await createClosedProjectWithEntries(1);

    const { data: invoice } = await ownerAClient.rpc("create_draft_invoice", { p_tenant_id: TENANT_A_ID });
    await ownerAClient.rpc("bind_invoice_transaction", {
      p_invoice_id: invoice.id,
      p_transaction_entry_id: entryIds[0],
    });

    const [first, second] = await Promise.all([
      ownerAClient.rpc("issue_invoice", { p_invoice_id: invoice.id }),
      ownerAClient.rpc("issue_invoice", { p_invoice_id: invoice.id }),
    ]);

    const results = [first, second];
    const succeeded = results.filter((r) => r.error === null);
    const failed = results.filter((r) => r.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const { count } = await admin
      .from("access_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", invoice.id)
      .eq("action", "invoice.issued");
    expect(count).toBe(1);
  });

  it("concurrent bind_invoice_transaction calls from two different draft invoices for the same transaction: exactly one succeeds", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const { entryIds } = await createClosedProjectWithEntries(1);

    const { data: invoiceOne } = await ownerAClient.rpc("create_draft_invoice", { p_tenant_id: TENANT_A_ID });
    const { data: invoiceTwo } = await ownerAClient.rpc("create_draft_invoice", { p_tenant_id: TENANT_A_ID });

    const [first, second] = await Promise.all([
      ownerAClient.rpc("bind_invoice_transaction", {
        p_invoice_id: invoiceOne.id,
        p_transaction_entry_id: entryIds[0],
      }),
      ownerAClient.rpc("bind_invoice_transaction", {
        p_invoice_id: invoiceTwo.id,
        p_transaction_entry_id: entryIds[0],
      }),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.filter((r) => r.error !== null)).toHaveLength(1);

    const { count } = await admin
      .from("invoice_transaction_lines")
      .select("id", { count: "exact", head: true })
      .eq("transaction_entry_id", entryIds[0]);
    expect(count).toBe(1);
  });

  it("uploads a real file to the private bucket, finalizes it, and only owner/admin can read it back via a signed URL", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const reviewerAClient = await signInAsMember(reviewerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);
    const invoiceId = await createIssuedInvoice(1);

    const fileBytes = new TextEncoder().encode("%PDF-1.4 fake signed invoice content for integration test");
    const storagePath = `${TENANT_A_ID}/${invoiceId}/1-${crypto.randomUUID()}.pdf`;

    const { error: uploadError } = await ownerAClient.storage
      .from("invoice-evidence")
      .upload(storagePath, fileBytes, { contentType: "application/pdf" });
    expect(uploadError).toBeNull();

    // Not yet finalized — no invoice_evidence_versions row references this
    // path yet, so the SELECT policy denies everyone, including owner.
    const beforeFinalize = await ownerAClient.storage.from("invoice-evidence").createSignedUrl(storagePath, 60);
    expect(beforeFinalize.data).toBeNull();

    const sha256 = Buffer.from(
      await crypto.subtle.digest("SHA-256", fileBytes),
    ).toString("hex");

    const { data: version, error: finalizeError } = await ownerAClient.rpc("finalize_invoice_evidence_version", {
      p_invoice_id: invoiceId,
      p_storage_path: storagePath,
      p_sha256: sha256,
      p_size_bytes: fileBytes.byteLength,
      p_mime_type: "application/pdf",
    });
    expect(finalizeError).toBeNull();
    expect(version.version_number).toBe(1);
    expect(version.status).toBe("pending");

    const ownerSigned = await ownerAClient.storage.from("invoice-evidence").createSignedUrl(storagePath, 60);
    expect(ownerSigned.error).toBeNull();
    expect(ownerSigned.data?.signedUrl).toBeTruthy();

    const reviewerSigned = await reviewerAClient.storage.from("invoice-evidence").createSignedUrl(storagePath, 60);
    expect(reviewerSigned.data).toBeNull();

    const crossTenantSigned = await ownerBClient.storage.from("invoice-evidence").createSignedUrl(storagePath, 60);
    expect(crossTenantSigned.data).toBeNull();
  });

  it("rejects a real upload under a draft (not-issued) invoice's path, and a cross-tenant path forgery", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);
    const { entryIds } = await createClosedProjectWithEntries(1);
    const { data: draftInvoice } = await ownerAClient.rpc("create_draft_invoice", { p_tenant_id: TENANT_A_ID });
    await ownerAClient.rpc("bind_invoice_transaction", {
      p_invoice_id: draftInvoice.id,
      p_transaction_entry_id: entryIds[0],
    });

    const fileBytes = new TextEncoder().encode("draft invoice upload attempt");

    const { error: draftUploadError } = await ownerAClient.storage
      .from("invoice-evidence")
      .upload(`${TENANT_A_ID}/${draftInvoice.id}/1-${crypto.randomUUID()}.pdf`, fileBytes, {
        contentType: "application/pdf",
      });
    expect(draftUploadError).not.toBeNull();

    const invoiceId = await createIssuedInvoice(1);
    const { error: forgedTenantUploadError } = await ownerBClient.storage
      .from("invoice-evidence")
      .upload(`${TENANT_A_ID}/${invoiceId}/1-${crypto.randomUUID()}.pdf`, fileBytes, {
        contentType: "application/pdf",
      });
    expect(forgedTenantUploadError).not.toBeNull();
  });

  it("anonymous requests get zero access to invoices, evidence, and the private bucket", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invoices, error: invoicesError } = await anonClient.from("invoices").select("id");
    expect(invoicesError).not.toBeNull();
    expect(invoices).toBeNull();

    const { error: rpcError } = await anonClient.rpc("create_draft_invoice", { p_tenant_id: TENANT_A_ID });
    expect(rpcError).not.toBeNull();

    const { error: uploadError } = await anonClient.storage
      .from("invoice-evidence")
      .upload(`${TENANT_A_ID}/00000000-0000-0000-0000-000000000000/1-anon.pdf`, new Uint8Array([1, 2, 3]));
    expect(uploadError).not.toBeNull();
  });
});
