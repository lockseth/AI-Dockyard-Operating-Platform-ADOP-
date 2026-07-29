import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import {
  createUserWithTemporaryPassword,
  inviteUserByEmail,
  setTemporaryPasswordAndConfirm,
} from "./admin-repository";
import { GENERIC_USER_MANAGEMENT_ERROR, mapUserManagementError } from "./errors";
import {
  acceptTenantInvitationRpc,
  createTenantInvitationRpc,
  listPendingInvitationsForCurrentUser as listPendingInvitationsForCurrentUserRepo,
  listPendingInvitationsForTenant,
  listTenantMembers,
  ownerAuthorizeMemberPasswordResetRpc,
  ownerFinalizeMemberProvisioningRpc,
  ownerProvisionInvitedMemberRpc,
  ownerResolveProvisionTargetRpc,
  setMembershipRoleRpc,
  setMembershipStatusRpc,
} from "./repository";
import type {
  ChangeMembershipRoleInput,
  InviteMemberInput,
  ProvisionInvitedMemberInput,
  ProvisionMemberInput,
  ResetMemberTemporaryPasswordInput,
  SetMembershipStatusInput,
} from "./validation";
import type {
  PendingInvitationForTenant,
  PendingInvitationForUser,
  ProvisionInvitedMemberActionResult,
  ProvisionMemberActionResult,
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

// Owner-initiated recovery path for a pending invitation whose target
// already has an auth.users account but never received a working accept
// link (see 20260729000000_owner_direct_provisioning.sql for every safety
// condition — authorization, cross-tenant conflicts, role match, identity
// ambiguity, idempotent retry — all enforced inside the RPC, not here).
//
// The membership/role/invitation-state change happens first, in the RPC;
// the temporary password is set second, via the admin client. If the RPC
// succeeds but the password step fails, the membership already exists (the
// RPC is idempotent on retry), so re-invoking this whole function is the
// correct recovery — it will skip straight to issuing a fresh password.
export async function provisionInvitedMemberDirectly(
  input: ProvisionInvitedMemberInput,
): Promise<ProvisionInvitedMemberActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await ownerProvisionInvitedMemberRpc(input.invitationId, input.expectedRole);
  if (error) {
    return { error: mapUserManagementError(error) };
  }
  if (!data) {
    return { error: "Undangan tidak valid, sudah kedaluwarsa, atau bukan lagi berstatus pending." };
  }

  const passwordResult = await setTemporaryPasswordAndConfirm(data.targetUserId);
  if (passwordResult.error || !passwordResult.temporaryPassword) {
    return {
      error: "Keanggotaan berhasil dibuat, tetapi gagal mengatur kata sandi sementara. Silakan coba lagi.",
    };
  }

  return { temporaryPassword: passwordResult.temporaryPassword };
}

// "Tambah User Internal" — replaces the email-invitation UX for internal
// (Admin/Viewer) users with immediate, direct provisioning. Every conflict
// (cross-tenant membership, same-tenant already-active) is checked
// read-only via owner_resolve_provision_target BEFORE any Admin API call,
// so a doomed request never creates an orphaned auth.users row. When the
// email already has an account, the membership is finalized FIRST and the
// temporary password set SECOND (same order as provisionInvitedMemberDirectly
// below) — if the password step fails, the owner recovers via the
// per-member "Reset Password Sementara" action rather than resubmitting
// this form (resubmitting would now see an already-active membership and
// correctly refuse it as a duplicate).
export async function provisionMemberDirectly(input: ProvisionMemberInput): Promise<ProvisionMemberActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data: resolved, error: resolveError } = await ownerResolveProvisionTargetRpc(context.tenantId, input.email);
  if (resolveError) {
    return { error: mapUserManagementError(resolveError) };
  }
  if (!resolved) {
    return { error: GENERIC_USER_MANAGEMENT_ERROR };
  }
  if (resolved.crossTenantConflict) {
    return { error: "Pengguna ini sudah memiliki keanggotaan aktif atau nonaktif pada tenant lain." };
  }
  if (resolved.sameTenantStatus === "active") {
    return { error: "Pengguna ini sudah menjadi anggota aktif pada tenant ini." };
  }

  let targetUserId = resolved.targetUserId;
  const newAuthAccount = !targetUserId;

  if (newAuthAccount) {
    const created = await createUserWithTemporaryPassword(input.email, input.displayName, input.temporaryPassword);
    if (created.error || !created.userId) {
      return { error: "Gagal membuat akun pengguna baru. Silakan coba lagi." };
    }
    targetUserId = created.userId;
  }

  const { error: finalizeError } = await ownerFinalizeMemberProvisioningRpc(
    context.tenantId,
    targetUserId as string,
    input.role,
    resolved.pendingInvitationId,
    newAuthAccount,
  );
  if (finalizeError) {
    return { error: mapUserManagementError(finalizeError) };
  }

  if (newAuthAccount) {
    // Password was already set atomically as part of createUser above —
    // nothing further to do here.
    return { temporaryPassword: input.temporaryPassword };
  }

  const passwordResult = await setTemporaryPasswordAndConfirm(targetUserId as string);
  if (passwordResult.error || !passwordResult.temporaryPassword) {
    return {
      error:
        "Keanggotaan berhasil diaktifkan, tetapi gagal mengatur kata sandi sementara. Gunakan tombol Reset Password Sementara untuk mencoba lagi.",
    };
  }
  return { temporaryPassword: passwordResult.temporaryPassword };
}

// Owner-only "Reset Password Sementara" for an already-active member —
// never changes membership/role, only issues a fresh temporary password and
// forces a change on next login. The RPC authorizes (owner, same tenant,
// not self, target must be active) and writes the audit event; the actual
// Admin API password set happens here, reusing the same function the
// direct-provisioning and stuck-invitation-recovery flows already use.
export async function resetMemberTemporaryPassword(
  input: ResetMemberTemporaryPasswordInput,
): Promise<ProvisionMemberActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data: targetUserId, error } = await ownerAuthorizeMemberPasswordResetRpc(input.membershipId);
  if (error) {
    return { error: mapUserManagementError(error) };
  }
  if (!targetUserId) {
    return { error: GENERIC_USER_MANAGEMENT_ERROR };
  }

  const passwordResult = await setTemporaryPasswordAndConfirm(targetUserId);
  if (passwordResult.error || !passwordResult.temporaryPassword) {
    return { error: "Gagal mengatur kata sandi sementara. Silakan coba lagi." };
  }
  return { temporaryPassword: passwordResult.temporaryPassword };
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
