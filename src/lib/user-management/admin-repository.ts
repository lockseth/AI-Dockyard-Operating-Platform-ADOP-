import "server-only";
import { randomInt } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";

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

const TEMP_PASSWORD_LENGTH = 20;
// No 0/O/1/I/l — avoids characters an owner reading this off a screen to
// someone else could easily transcribe wrong.
const TEMP_PASSWORD_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";

function generateTemporaryPassword(): string {
  let password = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password += TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)];
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
