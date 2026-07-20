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

  it("create/update/activate/deactivate each produce exactly one automatic audit event (Gate 1A.2)", async () => {
    const ownerAClient = await signInAsMember(ownerA.email);

    // create — mirrors createVendor's insertVendor() call. No manual audit
    // RPC is invoked anywhere in this test: the AFTER ROW trigger from Gate
    // 1A.1 is the only path that writes to master_data_audit_events.
    const { data: created, error: insertError } = await ownerAClient
      .from("vendors")
      .insert({ tenant_id: TENANT_A_ID, created_by: ownerA.id, display_name: "Audited Vendor" })
      .select("*")
      .single();
    expect(insertError).toBeNull();
    expect(created).not.toBeNull();

    const auditForEntity = async () => {
      const { data } = await ownerAClient
        .from("master_data_audit_events")
        .select("*")
        .eq("entity_id", created!.id)
        .order("created_at", { ascending: true });
      return data ?? [];
    };

    let events = await auditForEntity();
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("create");
    expect(events[0].tenant_id).toBe(TENANT_A_ID);
    expect(events[0].actor_user_id).toBe(ownerA.id);
    expect(events[0].before_data).toBeNull();
    expect((events[0].after_data as { display_name?: string })?.display_name).toBe("Audited Vendor");

    // update — mirrors updateVendor's updateVendorRow() call.
    const { data: updated, error: updateError } = await ownerAClient
      .from("vendors")
      .update({ display_name: "Audited Vendor Renamed" })
      .eq("tenant_id", TENANT_A_ID)
      .eq("id", created!.id)
      .select("*")
      .single();
    expect(updateError).toBeNull();
    expect(updated?.display_name).toBe("Audited Vendor Renamed");

    events = await auditForEntity();
    expect(events).toHaveLength(2);
    expect(events[1].action).toBe("update");
    expect((events[1].before_data as { display_name?: string })?.display_name).toBe("Audited Vendor");
    expect((events[1].after_data as { display_name?: string })?.display_name).toBe("Audited Vendor Renamed");

    // deactivate — mirrors setVendorStatus(id, "inactive").
    const { error: deactivateError } = await ownerAClient
      .from("vendors")
      .update({ status: "inactive" })
      .eq("tenant_id", TENANT_A_ID)
      .eq("id", created!.id)
      .select("*")
      .single();
    expect(deactivateError).toBeNull();

    events = await auditForEntity();
    expect(events).toHaveLength(3);
    expect(events[2].action).toBe("deactivate");

    // activate — mirrors setVendorStatus(id, "active").
    const { error: activateError } = await ownerAClient
      .from("vendors")
      .update({ status: "active" })
      .eq("tenant_id", TENANT_A_ID)
      .eq("id", created!.id)
      .select("*")
      .single();
    expect(activateError).toBeNull();

    events = await auditForEntity();
    expect(events).toHaveLength(4);
    expect(events[3].action).toBe("activate");

    // A mutation that touches zero rows (forged/nonexistent id) triggers no
    // AFTER ROW event at all — no partial audit trail on a no-op failure.
    const { data: noopUpdate, error: noopError } = await ownerAClient
      .from("vendors")
      .update({ display_name: "Should Not Apply" })
      .eq("tenant_id", TENANT_A_ID)
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .select("*");
    expect(noopError).toBeNull();
    expect(noopUpdate).toHaveLength(0);
    events = await auditForEntity();
    expect(events).toHaveLength(4);

    // viewer cannot read master-data audit detail at all.
    const viewerClient = await signInAsMember(viewerA.email);
    const { data: viewerAudit } = await viewerClient
      .from("master_data_audit_events")
      .select("id")
      .eq("entity_id", created!.id);
    expect(viewerAudit).toHaveLength(0);

    // reviewer CAN read audit events (owner/admin/reviewer per Gate 1A RLS)...
    const reviewerClient = await signInAsMember(reviewerA.email);
    const { data: reviewerAudit } = await reviewerClient
      .from("master_data_audit_events")
      .select("id")
      .eq("entity_id", created!.id);
    expect(reviewerAudit).toHaveLength(4);

    // ...but the manual audit RPC is locked for every authenticated role,
    // owner included — Gate 1A.1 revoked EXECUTE from `authenticated`
    // entirely, so there is no manual-audit path left to call.
    const { error: ownerRpcError } = await ownerAClient.rpc("log_master_data_audit_event", {
      p_tenant_id: TENANT_A_ID,
      p_entity_type: "vendor",
      p_entity_id: created!.id,
      p_action: "update",
      p_before_data: null,
      p_after_data: null,
    });
    expect(ownerRpcError).not.toBeNull();
    expect(ownerRpcError?.code).toBe("42501");

    const { error: reviewerRpcError } = await reviewerClient.rpc("log_master_data_audit_event", {
      p_tenant_id: TENANT_A_ID,
      p_entity_type: "vendor",
      p_entity_id: created!.id,
      p_action: "update",
      p_before_data: null,
      p_after_data: null,
    });
    expect(reviewerRpcError).not.toBeNull();
    expect(reviewerRpcError?.code).toBe("42501");

    // cross-tenant: tenant B cannot see tenant A's audit trail for this entity.
    const ownerBClient = await signInAsMember(ownerB.email);
    const { data: crossTenantAudit } = await ownerBClient
      .from("master_data_audit_events")
      .select("id")
      .eq("entity_id", created!.id);
    expect(crossTenantAudit).toHaveLength(0);

    // database errors on the mutation itself still propagate normally and
    // produce no audit event — a duplicate vendor_code violates no unique
    // constraint on vendors, so exercise a real constraint instead: an
    // out-of-range status value is rejected by the enum type, not silently
    // coerced, and the row (and its audit trail) is untouched.
    const { error: invalidStatusError } = await ownerAClient
      .from("vendors")
      .update({ status: "not-a-real-status" })
      .eq("tenant_id", TENANT_A_ID)
      .eq("id", created!.id)
      .select("*");
    expect(invalidStatusError).not.toBeNull();
    events = await auditForEntity();
    expect(events).toHaveLength(4);
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
