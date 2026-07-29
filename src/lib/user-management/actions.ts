"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { generateTemporaryPassword } from "./admin-repository";
import {
  acceptInvitation,
  changeMembershipRole,
  inviteMember,
  provisionInvitedMemberDirectly,
  provisionMemberDirectly,
  resetMemberTemporaryPassword,
  setMembershipStatus,
} from "./service";
import {
  parseAcceptInvitationFormData,
  parseChangeMembershipRoleFormData,
  parseInviteMemberFormData,
  parseProvisionInvitedMemberFormData,
  parseProvisionMemberFormData,
  parseResetMemberTemporaryPasswordFormData,
  parseSetMembershipStatusFormData,
} from "./validation";
import type {
  ProvisionInvitedMemberActionResult,
  ProvisionMemberActionResult,
  UserManagementActionResult,
} from "./types";

const USERS_PATH = "/app/users";

function mapThrown(error: unknown): UserManagementActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function inviteMemberAction(
  _prevState: UserManagementActionResult,
  formData: FormData,
): Promise<UserManagementActionResult> {
  const parsed = parseInviteMemberFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: UserManagementActionResult;
  try {
    result = await inviteMember(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(USERS_PATH);
  }
  return result;
}

export async function changeMembershipRoleAction(
  _prevState: UserManagementActionResult,
  formData: FormData,
): Promise<UserManagementActionResult> {
  const parsed = parseChangeMembershipRoleFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: UserManagementActionResult;
  try {
    result = await changeMembershipRole(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(USERS_PATH);
  }
  return result;
}

export async function setMembershipStatusAction(
  _prevState: UserManagementActionResult,
  formData: FormData,
): Promise<UserManagementActionResult> {
  const parsed = parseSetMembershipStatusFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: UserManagementActionResult;
  try {
    result = await setMembershipStatus(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(USERS_PATH);
  }
  return result;
}

export async function acceptInvitationAction(
  _prevState: UserManagementActionResult,
  formData: FormData,
): Promise<UserManagementActionResult> {
  const parsed = parseAcceptInvitationFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: UserManagementActionResult;
  try {
    result = await acceptInvitation(parsed.data.invitationId);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  // Re-derive and land on whichever tenant-selection route is correct now
  // that acceptance changed the caller's active memberships (single ->
  // /app directly, multiple -> /select-tenant) — reuses the existing
  // resolver instead of re-implementing that branching here.
  redirect("/tenant/resolve");
}

// Deliberately does NOT redirect on success (unlike acceptInvitationAction)
// — the owner stays on /app/users so the one-time temporary password in the
// returned state can actually be displayed.
//
// CORRECTIVE (Gate 6G-H): this used to call revalidatePath on every
// non-error result, including the success-with-temporaryPassword case —
// since every non-error result from provisionInvitedMemberDirectly() always
// carries a temporaryPassword, that revalidate fired immediately, refetching
// /app/users from the server and dropping the just-accepted row out of the
// pending-invitations list before the owner had a chance to copy the
// password shown for it. Refreshing the list is now solely
// acknowledgeTemporaryPasswordAction's job, called only after the owner
// explicitly clicks "Sudah Disalin".
export async function provisionInvitedMemberDirectlyAction(
  _prevState: ProvisionInvitedMemberActionResult,
  formData: FormData,
): Promise<ProvisionInvitedMemberActionResult> {
  const parsed = parseProvisionInvitedMemberFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    return await provisionInvitedMemberDirectly(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }
}

// "Tambah User Internal" — see provisionInvitedMemberDirectlyAction's
// CORRECTIVE comment above for why this also never revalidates on success:
// every non-error result here carries a one-time temporaryPassword that
// must stay visible until the owner explicitly acknowledges it.
export async function provisionMemberDirectlyAction(
  _prevState: ProvisionMemberActionResult,
  formData: FormData,
): Promise<ProvisionMemberActionResult> {
  const parsed = parseProvisionMemberFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    return await provisionMemberDirectly(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }
}

// Owner-only "Reset Password Sementara" on an already-active member — same
// display-until-acknowledged contract as the two actions above.
export async function resetMemberTemporaryPasswordAction(
  _prevState: ProvisionMemberActionResult,
  formData: FormData,
): Promise<ProvisionMemberActionResult> {
  const parsed = parseResetMemberTemporaryPasswordFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    return await resetMemberTemporaryPassword(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }
}

// Called once the owner clicks "Sudah Disalin" on any of the three
// temporary-password reveals above — the single point that actually
// refreshes /app/users, deliberately decoupled from the mutation itself so
// the password stays visible for as long as the owner needs it.
export async function acknowledgeTemporaryPasswordAction(): Promise<void> {
  revalidatePath(USERS_PATH);
}

// Returns a fresh candidate from the same generator admin-repository.ts
// uses for the real thing — lets the "Generate Ulang" control in the Add
// User form issue a new one without a second, potentially-drifting
// client-side implementation. Never persists or logs the value; it only
// ever flows back into the form's own password field.
export async function generateTemporaryPasswordAction(): Promise<string> {
  return generateTemporaryPassword();
}
