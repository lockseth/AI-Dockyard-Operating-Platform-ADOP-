import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production. These
// tests exercise the same RLS-scoped query surface the master-data
// repository/service layer uses (real authenticated HTTP requests through
// PostgREST, not mocks) — Server Action / cookie / redirect behavior on top
// of this was verified end-to-end via Browser UAT, same split as
// tenant-context.integration.test.ts from Gate 0B.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "master-data.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
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

describe("master data — real local Supabase", () => {
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let reviewerA: EphemeralMember;
  let viewerA: EphemeralMember;
  let ownerB: EphemeralMember;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({ emailPrefix: "md-owner-a", tenantId: TENANT_A_ID, role: "owner" });
    createdUserIds.push(ownerA.id);
    adminA = await createEphemeralMember({ emailPrefix: "md-admin-a", tenantId: TENANT_A_ID, role: "admin" });
    createdUserIds.push(adminA.id);
    reviewerA = await createEphemeralMember({ emailPrefix: "md-reviewer-a", tenantId: TENANT_A_ID, role: "reviewer" });
    createdUserIds.push(reviewerA.id);
    viewerA = await createEphemeralMember({ emailPrefix: "md-viewer-a", tenantId: TENANT_A_ID, role: "viewer" });
    createdUserIds.push(viewerA.id);
    ownerB = await createEphemeralMember({ emailPrefix: "md-owner-b", tenantId: TENANT_B_ID, role: "owner" });
    createdUserIds.push(ownerB.id);
  });

  afterAll(async () => {
    // Master-data rows aren't cascade-deleted by user removal (created_by is
    // ON DELETE SET NULL, not cascade) — clean them up explicitly first.
    if (createdClientIds.length > 0) {
      await admin.from("clients").delete().in("id", createdClientIds);
    }
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("owner A can create, read, update, and deactivate a client end to end", async () => {
    const clientA = await signInAsMember(ownerA.email);

    const { data: created, error: insertError } = await clientA
      .from("clients")
      .insert({
        tenant_id: TENANT_A_ID,
        created_by: ownerA.id,
        display_name: "Integration Test Client",
        client_code: `IT-${Date.now()}`,
      })
      .select("*")
      .single();
    expect(insertError).toBeNull();
    expect(created?.display_name).toBe("Integration Test Client");
    expect(created?.status).toBe("active");
    if (created) createdClientIds.push(created.id);

    const { data: read } = await clientA.from("clients").select("*").eq("id", created!.id).single();
    expect(read?.display_name).toBe("Integration Test Client");

    const { data: updated, error: updateError } = await clientA
      .from("clients")
      .update({ display_name: "Renamed Integration Test Client" })
      .eq("id", created!.id)
      .select("*")
      .single();
    expect(updateError).toBeNull();
    expect(updated?.display_name).toBe("Renamed Integration Test Client");

    const { data: deactivated } = await clientA
      .from("clients")
      .update({ status: "inactive" })
      .eq("id", created!.id)
      .select("*")
      .single();
    expect(deactivated?.status).toBe("inactive");

    // Deactivating never deletes — the row is still readable.
    const { data: stillThere } = await clientA.from("clients").select("id").eq("id", created!.id);
    expect(stillThere).toHaveLength(1);
  });

  it("admin A has the same CRUD rights as owner A", async () => {
    const adminClient = await signInAsMember(adminA.email);

    const { data: created, error } = await adminClient
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, created_by: adminA.id, display_name: "Admin Created Vendor" })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(created?.display_name).toBe("Admin Created Vendor");
  });

  it("reviewer A's mutation attempts are rejected — read-only", async () => {
    const reviewerClient = await signInAsMember(reviewerA.email);

    const { data: readable, error: readError } = await reviewerClient.from("clients").select("id").limit(1);
    expect(readError).toBeNull();
    expect(Array.isArray(readable)).toBe(true);

    const { data: inserted, error: insertError } = await reviewerClient
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, created_by: reviewerA.id, display_name: "Reviewer Forged Vendor" })
      .select();
    expect(insertError).not.toBeNull();
    expect(inserted).toBeNull();
  });

  it("viewer A's mutation attempts are rejected — read-only", async () => {
    const viewerClient = await signInAsMember(viewerA.email);

    const { error: insertError } = await viewerClient
      .from("facility_locations")
      .insert({ tenant_id: TENANT_A_ID, name: "Viewer Forged Location" });
    expect(insertError).not.toBeNull();

    const { error: deleteError } = await viewerClient.from("vendors").delete().eq("tenant_id", TENANT_A_ID);
    expect(deleteError).not.toBeNull();
  });

  it("Tenant A and Tenant B master data are isolated from each other", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);
    const ownerBClient = await signInAsMember(ownerB.email);

    const { data: bClientForB, error: bInsertError } = await ownerBClient
      .from("clients")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerB.id, display_name: "Tenant B Only Client" })
      .select("*")
      .single();
    expect(bInsertError).toBeNull();

    const { data: seenByA } = await ownerAClient.from("clients").select("id").eq("id", bClientForB!.id);
    expect(seenByA).toHaveLength(0);

    const { data: updateAttempt, error: updateError } = await ownerAClient
      .from("clients")
      .update({ display_name: "hacked-by-tenant-a" })
      .eq("id", bClientForB!.id)
      .select();
    expect(updateError).toBeNull();
    expect(updateAttempt).toHaveLength(0);

    await admin.from("clients").delete().eq("id", bClientForB!.id);
  });

  it("tenant_id and created_by cannot be forged by an authenticated owner", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { error: forgedTenantError } = await ownerAClient
      .from("vendors")
      .insert({ tenant_id: TENANT_B_ID, created_by: ownerA.id, display_name: "Forged Tenant Vendor" });
    expect(forgedTenantError).not.toBeNull();

    const { error: forgedActorError } = await ownerAClient
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, created_by: adminA.id, display_name: "Forged Actor Vendor" });
    expect(forgedActorError).not.toBeNull();
  });

  it("a master-data audit event is written on create via the log RPC, and is tenant-scoped/read-restricted", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    const { data: created } = await ownerAClient
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "Audited Vendor" })
      .select("*")
      .single();
    expect(created).not.toBeNull();

    const { error: rpcError } = await ownerAClient.rpc("log_master_data_audit_event", {
      p_tenant_id: TENANT_A_ID,
      p_entity_type: "vendor",
      p_entity_id: created!.id,
      p_action: "create",
      p_before_data: null,
      p_after_data: created,
    });
    expect(rpcError).toBeNull();

    const { data: auditRows } = await ownerAClient
      .from("master_data_audit_events")
      .select("*")
      .eq("entity_id", created!.id);
    expect(auditRows).toHaveLength(1);
    expect(auditRows?.[0]?.action).toBe("create");

    // viewer cannot read master-data audit detail at all.
    const viewerClient = await signInAsMember(viewerA.email);
    const { data: viewerAudit } = await viewerClient
      .from("master_data_audit_events")
      .select("id")
      .eq("entity_id", created!.id);
    expect(viewerAudit).toHaveLength(0);

    // reviewer cannot write an audit event directly via the RPC.
    const reviewerClient = await signInAsMember(reviewerA.email);
    const { error: reviewerRpcError } = await reviewerClient.rpc("log_master_data_audit_event", {
      p_tenant_id: TENANT_A_ID,
      p_entity_type: "vendor",
      p_entity_id: created!.id,
      p_action: "update",
      p_before_data: null,
      p_after_data: null,
    });
    expect(reviewerRpcError).not.toBeNull();
  });

  it("anonymous requests get zero access to any master-data table", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.from("clients").select("id");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
