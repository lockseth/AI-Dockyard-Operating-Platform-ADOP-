import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { inviteUserByEmail } from "./admin-repository";
import { mapUserManagementError } from "./errors";
import {
  acceptTenantInvitationRpc,
  createTenantInvitationRpc,
  listPendingInvitationsForCurrentUser as listPendingInvitationsForCurrentUserRepo,
  listPendingInvitationsForTenant,
  listTenantMembers,
  setMembershipRoleRpc,
  setMembershipStatusRpc,
} from "./repository";
import type { ChangeMembershipRoleInput, InviteMemberInput, SetMembershipStatusInput } from "./validation";
import type {
  PendingInvitationForTenant,
  PendingInvitationForUser,
  TenantMemberSummary,
  UserManagementActionResult,
} from "./types";

const INVITE_ACCEPT_PATH = "/invite/accept";

export async function listMembersForActiveTenant(): Promise<TenantMemberSummary[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listTenantMembers(context.tenantId);
}

export async function listPendingInvitationsForActiveTenant(): Promise<PendingInvitationForTenant[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listPendingInvitationsForTenant(context.tenantId);
}

// Used by /invite/accept (and anywhere else offering an Accept action) —
// deliberately does NOT require any tenant role, since by definition the
// caller may not hold one yet in the tenant(s) that invited them.
export async function listPendingInvitationsForCurrentUser(): Promise<PendingInvitationForUser[]> {
  return listPendingInvitationsForCurrentUserRepo();
}

// Every user — new or already holding an account elsewhere — only ever
// receives a pending tenant_invitations row here. Membership is never
// created as a side effect of this call; it is created later, atomically,
// by acceptInvitation() for that exact invitation. See
// public.create_tenant_invitation for the authorization/duplicate/
// already-active-member checks and its idempotent-on-retry behavior.
export async function inviteMember(input: InviteMemberInput): Promise<UserManagementActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await createTenantInvitationRpc(context.tenantId, input.email, input.role);
  if (error || !data) {
    return { error: mapUserManagementError(error) };
  }

  // Only a brand-new email needs a real Supabase invite (creates the
  // auth.users row + sends the email). An email that already has an account
  // gets no email from us at all — no notification automation is in pilot
  // scope — they will see this pending invitation next time they sign in.
  if (!data.targetUserExists) {
    const invited = await inviteUserByEmail(input.email, input.displayName, INVITE_ACCEPT_PATH);
    if (invited.error) {
      // The pending invitation row already exists and is safe to retry
      // (create_tenant_invitation reuses it) — an email-send failure here
      // must not be reported as if nothing happened, but it also must not
      // leave a duplicate row behind on retry.
      return { error: "Undangan dibuat, tetapi gagal mengirim email. Silakan coba kirim ulang." };
    }
  }

  return {};
}

// Accepts exactly the one invitation identified by invitationId — never a
// mass "activate everything invited for this user" operation. Membership
// creation/activation and role assignment happen atomically inside
// public.accept_tenant_invitation.
export async function acceptInvitation(invitationId: string): Promise<UserManagementActionResult> {
  const { data, error } = await acceptTenantInvitationRpc(invitationId);
  if (error) {
    return { error: mapUserManagementError(error) };
  }
  // A null (non-error) result means the invitation was pending but expired
  // — the RPC marks it 'expired' as a durable side effect and returns null
  // rather than raising, since raising would roll that update back too.
  if (!data) {
    return { error: "Undangan tidak valid atau sudah kedaluwarsa. Minta undangan baru dari owner." };
  }
  return {};
}

export async function changeMembershipRole(input: ChangeMembershipRoleInput): Promise<UserManagementActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { error } = await setMembershipRoleRpc(input.membershipId, input.role);
  if (error) {
    return { error: mapUserManagementError(error) };
  }
  return {};
}

export async function setMembershipStatus(input: SetMembershipStatusInput): Promise<UserManagementActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { error } = await setMembershipStatusRpc(input.membershipId, input.status);
  if (error) {
    return { error: mapUserManagementError(error) };
  }
  return {};
}
