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

  it("owner directly provisions a stuck pending invitation for an existing account, and the resulting temporary password actually signs in (Gate 6G-H)", async () => {
    const stuckInvitee = await createEphemeralMember({ emailPrefix: "um-stuck-invitee", memberships: [] });
    createdUserIds.push(stuckInvitee.id);

    const clientOwnerA = await signInAsMember(ownerA.email);
    const { data: invitation, error: inviteError } = await createTenantInvitation(
      clientOwnerA,
      TENANT_A_ID,
      stuckInvitee.email,
      "viewer",
    );
    expect(inviteError).toBeNull();

    const rpcResult = await clientOwnerA
      .rpc("owner_provision_invited_member", {
        p_invitation_id: invitation!.invitation_id,
        p_expected_role: "viewer",
      })
      .single();
    expect(rpcResult.error).toBeNull();
    expect((rpcResult.data as { target_user_id: string } | null)?.target_user_id).toBe(stuckInvitee.id);

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id, status")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", stuckInvitee.id)
      .single();
    expect(membership?.status).toBe("active");

    const { data: roleRow } = await admin
      .from("membership_roles")
      .select("role")
      .eq("membership_id", membership!.id)
      .single();
    expect(roleRow?.role).toBe("viewer");

    const { data: invitationRow } = await admin
      .from("tenant_invitations")
      .select("status, accepted_by")
      .eq("id", invitation!.invitation_id)
      .single();
    expect(invitationRow?.status).toBe("accepted");
    expect(invitationRow?.accepted_by).toBe(ownerA.id);

    // The temp-password/email_confirm/app_metadata step is TS-side
    // (admin-repository.ts's setTemporaryPasswordAndConfirm, unit-tested
    // with mocks in service.test.ts) — here it's exercised for real against
    // Supabase Auth, proving the actual contract: the freshly-set password
    // must sign the target in, and must_change_password must be set.
    const temporaryPassword = `Gate6GH-${crypto.randomUUID()}`;
    const { error: updateError } = await admin.auth.admin.updateUserById(stuckInvitee.id, {
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });
    expect(updateError).toBeNull();

    const { data: fetchedUser } = await admin.auth.admin.getUserById(stuckInvitee.id);
    expect(fetchedUser.user?.app_metadata?.must_change_password).toBe(true);

    const signInClient = await signInAsMember(stuckInvitee.email).catch(() => null);
    // signInAsMember uses the shared EPHEMERAL_PASSWORD fixture, not the
    // freshly-issued one — sign in directly with the temporary password
    // instead to prove *that* password is the one that actually works now.
    const { createClient } = await import("@supabase/supabase-js");
    const rawClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await rawClient.auth.signInWithPassword({
      email: stuckInvitee.email,
      password: temporaryPassword,
    });
    expect(signInError).toBeNull();
    expect(signInData.session).toBeTruthy();
    expect(signInClient).toBeNull(); // the old ephemeral password no longer works
  });

  it("retrying owner_provision_invited_member on an already-provisioned invitation is idempotent — same membership, exactly one audit event", async () => {
    const idempotentInvitee = await createEphemeralMember({ emailPrefix: "um-idempotent-invitee", memberships: [] });
    createdUserIds.push(idempotentInvitee.id);

    const clientOwnerA = await signInAsMember(ownerA.email);
    const { data: invitation } = await createTenantInvitation(
      clientOwnerA,
      TENANT_A_ID,
      idempotentInvitee.email,
      "admin",
    );

    const first = await clientOwnerA
      .rpc("owner_provision_invited_member", {
        p_invitation_id: invitation!.invitation_id,
        p_expected_role: "admin",
      })
      .single();
    expect(first.error).toBeNull();

    const second = await clientOwnerA
      .rpc("owner_provision_invited_member", {
        p_invitation_id: invitation!.invitation_id,
        p_expected_role: "admin",
      })
      .single();
    expect(second.error).toBeNull();
    expect((second.data as { membership_id: string } | null)?.membership_id).toBe(
      (first.data as { membership_id: string } | null)?.membership_id,
    );

    const { count } = await admin
      .from("access_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("action", "member_direct_provisioned")
      .eq("entity_id", (first.data as { membership_id: string }).membership_id);
    expect(count).toBe(1);
  });

  it("owner cannot provision an invitation whose target already has an active membership in another tenant", async () => {
    const crossTenantMember = await createEphemeralMember({
      emailPrefix: "um-cross-tenant-member",
      memberships: [{ tenantId: TENANT_B_ID, role: "viewer" }],
    });
    createdUserIds.push(crossTenantMember.id);

    const clientOwnerA = await signInAsMember(ownerA.email);
    const { data: invitation } = await createTenantInvitation(
      clientOwnerA,
      TENANT_A_ID,
      crossTenantMember.email,
      "viewer",
    );

    const { error } = await clientOwnerA
      .rpc("owner_provision_invited_member", {
        p_invitation_id: invitation!.invitation_id,
        p_expected_role: "viewer",
      })
      .single();
    expect(error).not.toBeNull();
  });

  it("direct provisioning: brand-new email creates an auth user + active membership, and the resulting temporary password actually signs in (Gate 6G-H)", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);
    const email = `um-direct-new-${crypto.randomUUID()}@adop-integration.local`;

    const resolved = await clientOwnerA
      .rpc("owner_resolve_provision_target", { p_tenant_id: TENANT_A_ID, p_email: email })
      .single();
    expect(resolved.error).toBeNull();
    const resolvedData = resolved.data as { target_user_id: string | null; cross_tenant_conflict: boolean } | null;
    expect(resolvedData?.target_user_id).toBeNull();
    expect(resolvedData?.cross_tenant_conflict).toBe(false);

    const temporaryPassword = `Gate6GH-Direct-${crypto.randomUUID()}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: "Direct Provision Test" },
      app_metadata: { must_change_password: true },
    });
    expect(createError).toBeNull();
    createdUserIds.push(created!.user!.id);

    const finalized = await clientOwnerA
      .rpc("owner_finalize_member_provisioning", {
        p_tenant_id: TENANT_A_ID,
        p_target_user_id: created!.user!.id,
        p_role: "viewer",
        p_pending_invitation_id: null,
        p_new_auth_account: true,
      })
      .single();
    expect(finalized.error).toBeNull();
    expect((finalized.data as { reactivated: boolean } | null)?.reactivated).toBe(false);

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id, status")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", created!.user!.id)
      .single();
    expect(membership?.status).toBe("active");

    const { createClient } = await import("@supabase/supabase-js");
    const rawClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await rawClient.auth.signInWithPassword({
      email,
      password: temporaryPassword,
    });
    expect(signInError).toBeNull();
    expect(signInData.session).toBeTruthy();
  });

  it("direct provisioning: reuses an existing auth user with no membership anywhere, without creating a duplicate account", async () => {
    // A dedicated fixture, not the shared existingUserNoMembership — that
    // one is deliberately consumed earlier in this same file (invited, then
    // accepted into TENANT_A_ID by the accept_tenant_invitation tests
    // above), so by this point it already has an active membership there.
    const freshExistingUser = await createEphemeralMember({ emailPrefix: "um-direct-reuse", memberships: [] });
    createdUserIds.push(freshExistingUser.id);

    const clientOwnerA = await signInAsMember(ownerA.email);

    const resolved = await clientOwnerA
      .rpc("owner_resolve_provision_target", { p_tenant_id: TENANT_A_ID, p_email: freshExistingUser.email })
      .single();
    expect(resolved.error).toBeNull();
    expect((resolved.data as { target_user_id: string } | null)?.target_user_id).toBe(freshExistingUser.id);

    const finalized = await clientOwnerA
      .rpc("owner_finalize_member_provisioning", {
        p_tenant_id: TENANT_A_ID,
        p_target_user_id: freshExistingUser.id,
        p_role: "admin",
        p_pending_invitation_id: null,
        p_new_auth_account: false,
      })
      .single();
    expect(finalized.error).toBeNull();

    const { data: memberships } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", freshExistingUser.id);
    expect(memberships).toHaveLength(1);
  });

  it("direct provisioning: reactivates an existing suspended same-tenant membership and replaces its role", async () => {
    const suspendedMember = await createEphemeralMember({
      emailPrefix: "um-direct-suspended",
      memberships: [{ tenantId: TENANT_A_ID, role: "viewer", status: "suspended" }],
    });
    createdUserIds.push(suspendedMember.id);

    const clientOwnerA = await signInAsMember(ownerA.email);
    const finalized = await clientOwnerA
      .rpc("owner_finalize_member_provisioning", {
        p_tenant_id: TENANT_A_ID,
        p_target_user_id: suspendedMember.id,
        p_role: "admin",
        p_pending_invitation_id: null,
        p_new_auth_account: false,
      })
      .single();
    expect(finalized.error).toBeNull();
    expect((finalized.data as { reactivated: boolean } | null)?.reactivated).toBe(true);

    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id, status")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", suspendedMember.id)
      .single();
    expect(membership?.status).toBe("active");

    const { data: roleRow } = await admin
      .from("membership_roles")
      .select("role")
      .eq("membership_id", membership!.id)
      .single();
    expect(roleRow?.role).toBe("admin");
  });

  it("direct provisioning: refuses a target already an active member of this tenant (STOP duplicate)", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);

    const { error } = await clientOwnerA
      .rpc("owner_finalize_member_provisioning", {
        p_tenant_id: TENANT_A_ID,
        p_target_user_id: adminA.id,
        p_role: "viewer",
        p_pending_invitation_id: null,
        p_new_auth_account: false,
      })
      .single();
    expect(error).not.toBeNull();
  });

  it("direct provisioning: refuses a target with an active membership in another tenant (STOP cross-tenant conflict)", async () => {
    const clientOwnerA = await signInAsMember(ownerA.email);

    const resolved = await clientOwnerA
      .rpc("owner_resolve_provision_target", { p_tenant_id: TENANT_A_ID, p_email: ownerB.email })
      .single();
    expect(resolved.error).toBeNull();
    expect((resolved.data as { cross_tenant_conflict: boolean } | null)?.cross_tenant_conflict).toBe(true);

    const { error } = await clientOwnerA
      .rpc("owner_finalize_member_provisioning", {
        p_tenant_id: TENANT_A_ID,
        p_target_user_id: ownerB.id,
        p_role: "viewer",
        p_pending_invitation_id: null,
        p_new_auth_account: false,
      })
      .single();
    expect(error).not.toBeNull();
  });

  it("Reset Password Sementara: owner resets an active member's password, and the fresh password actually signs in", async () => {
    const activeMember = await createEphemeralMember({
      emailPrefix: "um-reset-active",
      memberships: [{ tenantId: TENANT_A_ID, role: "viewer" }],
    });
    createdUserIds.push(activeMember.id);

    const { data: membershipRow } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", activeMember.id)
      .single();

    const clientOwnerA = await signInAsMember(ownerA.email);
    const { data: targetUserId, error } = await clientOwnerA.rpc("owner_authorize_member_password_reset", {
      p_membership_id: membershipRow!.id,
    });
    expect(error).toBeNull();
    expect(targetUserId).toBe(activeMember.id);

    const freshPassword = `Gate6GH-Reset-${crypto.randomUUID()}`;
    const { error: updateError } = await admin.auth.admin.updateUserById(activeMember.id, {
      password: freshPassword,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });
    expect(updateError).toBeNull();

    const { createClient } = await import("@supabase/supabase-js");
    const rawClient = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await rawClient.auth.signInWithPassword({
      email: activeMember.email,
      password: freshPassword,
    });
    expect(signInError).toBeNull();
    expect(signInData.session).toBeTruthy();
  });

  it("Reset Password Sementara: owner cannot reset their own password, and cannot reset a suspended member's password", async () => {
    const suspendedMember = await createEphemeralMember({
      emailPrefix: "um-reset-suspended",
      memberships: [{ tenantId: TENANT_A_ID, role: "viewer", status: "suspended" }],
    });
    createdUserIds.push(suspendedMember.id);

    const clientOwnerA = await signInAsMember(ownerA.email);

    const { data: ownRow } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", ownerA.id)
      .single();
    const selfResult = await clientOwnerA.rpc("owner_authorize_member_password_reset", {
      p_membership_id: ownRow!.id,
    });
    expect(selfResult.error).not.toBeNull();

    const { data: suspendedRow } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", TENANT_A_ID)
      .eq("user_id", suspendedMember.id)
      .single();
    const suspendedResult = await clientOwnerA.rpc("owner_authorize_member_password_reset", {
      p_membership_id: suspendedRow!.id,
    });
    expect(suspendedResult.error).not.toBeNull();
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
