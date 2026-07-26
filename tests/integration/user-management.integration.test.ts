import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  createEphemeralMember as createEphemeralMemberBase,
  signInAsMember as signInAsMemberBase,
  type EphemeralMember,
} from "./support/members";

// Real local Supabase only — never point this at demo/production.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "user-management.integration.test requires NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
      ".env.local — run `pnpm supabase:start` first.",
  );
}

// Seeded by supabase/seed.sql.
const TENANT_A_ID = "a1111111-1111-4111-8111-111111111111";
const TENANT_B_ID = "b2222222-2222-4222-8222-222222222222";

const admin = createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createEphemeralMember(params: {
  emailPrefix: string;
  memberships: Array<{ tenantId: string; role?: "owner" | "admin" | "reviewer" | "viewer"; status?: "invited" | "active" | "suspended" }>;
}): Promise<EphemeralMember> {
  return createEphemeralMemberBase(admin, params);
}

async function signInAsMember(email: string): Promise<SupabaseClient> {
  return signInAsMemberBase(SUPABASE_URL!, ANON_KEY!, email);
}

async function cleanupInvitations(tenantId: string) {
  await admin.from("tenant_invitations").delete().eq("tenant_id", tenantId);
}

interface CreateInvitationRpcResult {
  invitation_id: string;
  target_user_exists: boolean;
}

// The support/members.ts clients are deliberately untyped (SupabaseClient
// with no <Database> generic — reused generically across every integration
// test in this repo), so .rpc(...).single() on a table-returning function
// narrows to `{}` rather than this RPC's real shape. Cast at the one place
// that calls it instead of fighting the generic client type everywhere.
async function createTenantInvitation(
  client: SupabaseClient,
  tenantId: string,
  email: string,
  role: "owner" | "admin" | "reviewer" | "viewer",
) {
  const result = await client
    .rpc("create_tenant_invitation", { p_tenant_id: tenantId, p_email: email, p_role: role })
    .single();
  return { data: result.data as CreateInvitationRpcResult | null, error: result.error };
}

describe("user-management — real local Supabase", () => {
  const createdUserIds: string[] = [];
  let ownerA: EphemeralMember;
  let adminA: EphemeralMember;
  let ownerB: EphemeralMember;
  let existingUserNoMembership: EphemeralMember;

  // The last-owner test needs to know the *exact* owner count of a tenant at
  // a given moment — TENANT_A_ID/TENANT_B_ID are shared, seeded tenants that
  // other integration test files also attach their own ephemeral "owner"
  // fixtures to (often running concurrently, in separate vitest workers), so
  // asserting an exact owner count against them would be flaky. A private
  // tenant created just for this test file removes that interference.
  let privateTenantId: string;
  let lastOwner1: EphemeralMember;
  let lastOwner2: EphemeralMember;

  beforeAll(async () => {
    ownerA = await createEphemeralMember({
      emailPrefix: "um-owner-a",
      memberships: [{ tenantId: TENANT_A_ID, role: "owner" }],
    });
    createdUserIds.push(ownerA.id);

    adminA = await createEphemeralMember({
      emailPrefix: "um-admin-a",
      memberships: [{ tenantId: TENANT_A_ID, role: "admin" }],
    });
    createdUserIds.push(adminA.id);

    ownerB = await createEphemeralMember({
      emailPrefix: "um-owner-b",
      memberships: [{ tenantId: TENANT_B_ID, role: "owner" }],
    });
    createdUserIds.push(ownerB.id);

    // Has a real account (auth.users + profiles row) but no membership
    // anywhere — the "existing user invited into a new tenant" case.
    existingUserNoMembership = await createEphemeralMember({
      emailPrefix: "um-existing-prospect",
      memberships: [],
    });
    createdUserIds.push(existingUserNoMembership.id);

    const { data: tenantRow, error: tenantError } = await admin
      .from("tenants")
      .insert({ slug: `um-last-owner-${crypto.randomUUID()}`, display_name: "UM Last-Owner Test Tenant" })
      .select("id")
      .single();
    if (tenantError || !tenantRow) {
      throw new Error(`failed to create private test tenant: ${tenantError?.message}`);
    }
    privateTenantId = tenantRow.id;

    lastOwner1 = await createEphemeralMember({
      emailPrefix: "um-last-owner-1",
      memberships: [{ tenantId: privateTenantId, role: "owner" }],
    });
    createdUserIds.push(lastOwner1.id);

    lastOwner2 = await createEphemeralMember({
      emailPrefix: "um-last-owner-2",
      memberships: [{ tenantId: privateTenantId, role: "owner" }],
    });
    createdUserIds.push(lastOwner2.id);
  });

  afterAll(async () => {
    await cleanupInvitations(TENANT_A_ID);
    await cleanupInvitations(TENANT_B_ID);
    // Deleting the auth user cascades to profiles/tenant_memberships/
    // membership_roles — cleans up everything else this test created.
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
    // Cascades to the private tenant's own memberships/roles/invitations/
    // audit events.
    if (privateTenantId) {
      await admin.from("tenants").delete().eq("id", privateTenantId);
    }
  });

  it("admin (non-owner) cannot create a tenant invitation", async () => {
    const clientAdminA = await signInAsMember(adminA.email);
    const { error } = await clientAdminA.rpc("create_tenant_invitation", {
      p_tenant_id: TENANT_A_ID,
      p_email: "someone-new@adop-integration.local",
      p_role: "viewer",
    });
    expect(error).not.toBeNull();
  });

  it("owner of a different tenant cannot create an invitation for Tenant A", async () => {
    const clientOwnerB = await signInAsMember(ownerB.email);
    const { error } = await clientOwnerB.rpc("create_tenant_invitation", {
      p_tenant_id: TENANT_A_ID,
      p_email: "someone-new@adop-integration.local",
      p_role: "viewer",
    });
    expect(error).not.toBeNull();
  });

  it("owner invites a brand-new email — pending invitation created, no membership yet", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);
    const email = "brand-new-invitee@adop-integration.local";

    const { data, error } = await createTenantInvitation(clientOwnerA, TENANT_A_ID, email, "viewer");

    expect(error).toBeNull();
    expect(data?.target_user_exists).toBe(false);

    const { data: invitationRows } = await admin
      .from("tenant_invitations")
      .select("id, status")
      .eq("tenant_id", TENANT_A_ID)
      .eq("email", email);
    expect(invitationRows).toHaveLength(1);
    expect(invitationRows?.[0].status).toBe("pending");
  });

  it("re-inviting the same pending email is idempotent — no duplicate row", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);
    const email = "idempotent-invitee@adop-integration.local";

    const first = await createTenantInvitation(clientOwnerA, TENANT_A_ID, email, "viewer");
    const second = await createTenantInvitation(clientOwnerA, TENANT_A_ID, email, "admin");

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data?.invitation_id).toBe(first.data?.invitation_id);

    const { data: rows } = await admin
      .from("tenant_invitations")
      .select("id, role")
      .eq("tenant_id", TENANT_A_ID)
      .eq("email", email);
    expect(rows).toHaveLength(1);
    expect(rows?.[0].role).toBe("admin");
  });

  it("inviting an email with an existing account reports target_user_exists — and only a pending invitation is created, not an active membership", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);

    const { data, error } = await createTenantInvitation(
      clientOwnerA,
      TENANT_A_ID,
      existingUserNoMembership.email,
      "viewer",
    );

    expect(error).toBeNull();
    expect(data?.target_user_exists).toBe(true);

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", existingUserNoMembership.id)
      .maybeSingle();
    expect(membership).toBeNull();
  });

  it("the existing user can accept their own pending invitation — membership + role created atomically", async () => {
    const { data: invitationRow } = await admin
      .from("tenant_invitations")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("email", existingUserNoMembership.email)
      .single();
    expect(invitationRow).toBeTruthy();

    const clientExisting = await signInAsMember(existingUserNoMembership.email);
    const { error } = await clientExisting.rpc("accept_tenant_invitation", {
      p_invitation_id: invitationRow!.id,
    });
    expect(error).toBeNull();

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id, status")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", existingUserNoMembership.id)
      .single();
    expect(membership?.status).toBe("active");

    const { data: roleRow } = await admin
      .from("membership_roles")
      .select("role")
      .eq("membership_id", membership!.id)
      .single();
    expect(roleRow?.role).toBe("viewer");
  });

  it("a different user cannot accept someone else's invitation", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);
    const email = "not-for-owner-b@adop-integration.local";
    const { data } = await createTenantInvitation(clientOwnerA, TENANT_A_ID, email, "viewer");

    const clientOwnerB = await signInAsMember(ownerB.email);
    const { error } = await clientOwnerB.rpc("accept_tenant_invitation", { p_invitation_id: data!.invitation_id });
    expect(error).not.toBeNull();
  });

  it("owner cannot change their own role or status", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);
    const { data: ownRow } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", ownerA.id)
      .single();

    const roleResult = await clientOwnerA.rpc("set_membership_role", {
      p_membership_id: ownRow!.id,
      p_role: "admin",
    });
    expect(roleResult.error).not.toBeNull();

    const statusResult = await clientOwnerA.rpc("set_membership_status", {
      p_membership_id: ownRow!.id,
      p_status: "suspended",
    });
    expect(statusResult.error).not.toBeNull();
  });

  it("last-owner protection: cannot deactivate the sole remaining owner of a tenant", async () => {
    const clientOwner1 = await signInAsMember(lastOwner1.email);

    const { data: owner2Row } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", privateTenantId)
      .eq("user_id", lastOwner2.id)
      .single();

    // Safe: two owners exist in this private tenant, demoting one leaves one
    // owner — must succeed.
    const demote = await clientOwner1.rpc("set_membership_role", {
      p_membership_id: owner2Row!.id,
      p_role: "viewer",
    });
    expect(demote.error).toBeNull();

    // Unsafe: lastOwner1 is now the sole owner — even a raw admin-client
    // status update must be rejected by the role-independent trigger.
    const { data: owner1Row } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", privateTenantId)
      .eq("user_id", lastOwner1.id)
      .single();
    const { error } = await admin.from("tenant_memberships").update({ status: "suspended" }).eq("id", owner1Row!.id);
    expect(error).not.toBeNull();
  });

  it("audit events for accepted invitations never contain a password or token value", async () => {
    const { data: events } = await admin
      .from("access_audit_events")
      .select("before_data, after_data")
      .eq("tenant_id", TENANT_A_ID)
      .eq("entity_type", "tenant_invitation");

    for (const event of events ?? []) {
      const text = JSON.stringify(event.before_data) + JSON.stringify(event.after_data);
      expect(text.toLowerCase()).not.toMatch(/password|token/);
    }
  });
});
