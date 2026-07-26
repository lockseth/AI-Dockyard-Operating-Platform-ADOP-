import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TenantRole } from "@/lib/auth/tenant";
import type { PendingInvitationForTenant, PendingInvitationForUser, TenantMemberSummary } from "./types";

// Every query below is additionally scoped to `tenantId` even though RLS
// already enforces it — defense in depth, matching the master-data
// repository convention (see src/lib/master-data/vessels/repository.ts).
export async function listTenantMembers(tenantId: string): Promise<TenantMemberSummary[]> {
  const supabase = await createSupabaseServerClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("id, user_id, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (membershipError) throw membershipError;
  if (!memberships || memberships.length === 0) {
    return [];
  }

  const membershipIds = memberships.map((m) => m.id);
  const userIds = [...new Set(memberships.map((m) => m.user_id))];

  const [{ data: roleRows, error: roleError }, { data: profileRows, error: profileError }] = await Promise.all([
    supabase.from("membership_roles").select("membership_id, role").in("membership_id", membershipIds),
    supabase.from("profiles").select("user_id, email, display_name").in("user_id", userIds),
  ]);

  if (roleError) throw roleError;
  if (profileError) throw profileError;

  const rolesByMembership = new Map<string, TenantRole[]>();
  for (const row of roleRows ?? []) {
    const list = rolesByMembership.get(row.membership_id) ?? [];
    list.push(row.role);
    rolesByMembership.set(row.membership_id, list);
  }
  const profileByUser = new Map((profileRows ?? []).map((p) => [p.user_id, p]));

  return memberships.map((m) => {
    const profile = profileByUser.get(m.user_id);
    return {
      membershipId: m.id,
      userId: m.user_id,
      email: profile?.email ?? null,
      displayName: profile?.display_name ?? null,
      status: m.status,
      roles: rolesByMembership.get(m.id) ?? [],
      createdAt: m.created_at,
    };
  });
}

// Outstanding (pending, not-yet-expired) invitations for an owner's own
// tenant — read-only, backed by tenant_invitations_select_owner.
export async function listPendingInvitationsForTenant(tenantId: string): Promise<PendingInvitationForTenant[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_invitations")
    .select("id, email, role, expires_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .filter((row) => new Date(row.expires_at).getTime() > Date.now())
    .map((row) => ({ id: row.id, email: row.email, role: row.role, expiresAt: row.expires_at }));
}

// The current user's own pending invitations across every tenant that
// invited them — backed by tenant_invitations_select_own_email. Used by
// /invite/accept (and anywhere else offering an Accept action).
export async function listPendingInvitationsForCurrentUser(): Promise<PendingInvitationForUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_invitations")
    .select("id, tenant_id, role, expires_at, tenants(display_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .filter((row) => new Date(row.expires_at).getTime() > Date.now())
    .map((row) => {
      const tenant = row.tenants as { display_name: string } | { display_name: string }[] | null;
      const tenantDisplayName = Array.isArray(tenant) ? tenant[0]?.display_name : tenant?.display_name;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        tenantDisplayName: tenantDisplayName ?? "-",
        role: row.role,
        expiresAt: row.expires_at,
      };
    });
}

export interface CreateInvitationRpcResult {
  invitationId: string;
  targetUserExists: boolean;
}

// Wraps public.create_tenant_invitation — authorization (owner of
// tenantId), email normalization, duplicate-active-member rejection, and
// idempotent reuse of an existing pending invitation all happen inside the
// RPC itself, not here.
export async function createTenantInvitationRpc(
  tenantId: string,
  email: string,
  role: TenantRole,
): Promise<{ data: CreateInvitationRpcResult | null; error: PostgrestError | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("create_tenant_invitation", { p_tenant_id: tenantId, p_email: email, p_role: role })
    .single();

  if (error || !data) {
    return { data: null, error };
  }
  return {
    data: { invitationId: data.invitation_id, targetUserExists: data.target_user_exists },
    error: null,
  };
}

// Wraps public.accept_tenant_invitation — acceptance, membership
// creation/activation, and role assignment happen atomically inside the RPC
// for exactly this one invitation.
export async function acceptTenantInvitationRpc(invitationId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("accept_tenant_invitation", { p_invitation_id: invitationId });
}

// Wraps public.set_membership_role — authorization (owner of the
// membership's tenant), self-target rejection, and the atomic
// delete-existing-roles-then-insert-one all happen inside the RPC.
export async function setMembershipRoleRpc(membershipId: string, role: TenantRole) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("set_membership_role", { p_membership_id: membershipId, p_role: role });
}

// Wraps public.set_membership_status — same authorization shape as above.
export async function setMembershipStatusRpc(membershipId: string, status: "active" | "suspended") {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("set_membership_status", { p_membership_id: membershipId, p_status: status });
}
