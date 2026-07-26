"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { acceptInvitation, changeMembershipRole, inviteMember, setMembershipStatus } from "./service";
import {
  parseAcceptInvitationFormData,
  parseChangeMembershipRoleFormData,
  parseInviteMemberFormData,
  parseSetMembershipStatusFormData,
} from "./validation";
import type { UserManagementActionResult } from "./types";

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
