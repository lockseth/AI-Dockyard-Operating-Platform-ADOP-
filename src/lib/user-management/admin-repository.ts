import "server-only";
import { randomInt } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { TEMPORARY_PASSWORD_CHARSET, TEMPORARY_PASSWORD_LENGTH } from "./temporary-password";

// The ONLY file in src/lib/user-management allowed to reference
// @/lib/supabase/admin — enforced by admin-client-only.test.ts.
// auth.admin.inviteUserByEmail has no non-admin equivalent: it is the only
// way to create a not-yet-existing auth.users row and send its invite
// email. Whether the target email already has an account is decided by
// public.create_tenant_invitation (see repository.ts) — this file is never
// asked to look that up itself, so there is exactly one service-role call
// in this whole module.
export interface InviteUserByEmailResult {
  userId?: string;
  error?: string;
}

export async function inviteUserByEmail(
  email: string,
  displayName: string,
  nextPath: string,
): Promise<InviteUserByEmailResult> {
  const admin = createSupabaseAdminClient();
  const server = getServerEnv();
  const redirectTo = `${server.APP_URL}/auth/implicit-confirm?next=${encodeURIComponent(nextPath)}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Invite failed" };
  }
  return { userId: data.user.id };
}

// Exported so the "Generate Ulang" server action in the Add User form can
// issue a fresh candidate using this exact same cryptographically secure
// generator instead of a second, client-side implementation.
export function generateTemporaryPassword(): string {
  let password = "";
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) {
    password += TEMPORARY_PASSWORD_CHARSET[randomInt(TEMPORARY_PASSWORD_CHARSET.length)];
  }
  return password;
}

export interface SetTemporaryPasswordResult {
  temporaryPassword?: string;
  error?: string;
}

// Called only after public.owner_provision_invited_member has already
// created/confirmed the membership+role for this exact target — this step
// only ever touches auth.users via the Admin API (password hashing and
// app_metadata are not reachable from SQL at all). Deliberately not
// idempotent: every successful call issues a brand-new temporary password
// and immediately invalidates whatever was set before — retrying is exactly
// how the owner gets a fresh one if the last one was never delivered or
// copied. The returned password is never logged or persisted by this
// function; displaying it exactly once is the caller's responsibility.
export async function setTemporaryPasswordAndConfirm(userId: string): Promise<SetTemporaryPasswordResult> {
  const admin = createSupabaseAdminClient();
  const temporaryPassword = generateTemporaryPassword();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });

  if (error) {
    return { error: error.message };
  }
  return { temporaryPassword };
}

export interface CreateUserWithTemporaryPasswordResult {
  userId?: string;
  error?: string;
}

// Used only by the "Tambah User Internal" direct-provisioning flow, for the
// brand-new-email case — public.owner_resolve_provision_target has already
// confirmed (read-only) that no auth.users row exists for this email, so
// this is the one Admin API call that can create it. The temporary password
// is set here directly (not via a follow-up setTemporaryPasswordAndConfirm
// call) since createUser requires one password argument up front anyway —
// there is no separate "set password" step needed afterward for this case.
export async function createUserWithTemporaryPassword(
  email: string,
  displayName: string,
  temporaryPassword: string,
): Promise<CreateUserWithTemporaryPasswordResult> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { must_change_password: true },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Failed to create user" };
  }
  return { userId: data.user.id };
}

export interface ClearMustChangePasswordResult {
  error?: string;
}

// Called only from the "forced" branch of updatePasswordAction (auth/actions.ts)
// after the user has just successfully set their own new password — clearing
// app_metadata is only reachable via the service-role Admin API, and
// auth/actions.ts itself is guarded (no-service-role-exposure.test.ts)
// against ever importing that client directly, so this is the one sanctioned
// entry point it calls into instead.
export async function clearMustChangePasswordFlag(userId: string): Promise<ClearMustChangePasswordResult> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { must_change_password: false },
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}
