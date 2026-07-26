import "server-only";
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
  const redirectTo = `${server.APP_URL}/auth/confirm?next=${encodeURIComponent(nextPath)}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Invite failed" };
  }
  return { userId: data.user.id };
}
