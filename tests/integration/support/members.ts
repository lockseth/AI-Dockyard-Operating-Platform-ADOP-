import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Local-only ephemeral test credential — never a real password, never reused
// outside this Docker-local Supabase instance.
export const EPHEMERAL_PASSWORD = "adop-integration-test-P4ssword!";

export interface EphemeralMember {
  id: string;
  email: string;
}

export function createAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createEphemeralMember(
  admin: SupabaseClient,
  params: {
    emailPrefix: string;
    memberships: Array<{
      tenantId: string;
      role?: "owner" | "admin" | "reviewer" | "viewer";
      status?: "invited" | "active" | "suspended";
    }>;
  },
): Promise<EphemeralMember> {
  const email = `${params.emailPrefix}-${crypto.randomUUID()}@adop-integration.local`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: EPHEMERAL_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`createUser failed: ${createError?.message}`);
  }

  for (const membership of params.memberships) {
    const { data: membershipRow, error: membershipError } = await admin
      .from("tenant_memberships")
      .insert({
        tenant_id: membership.tenantId,
        user_id: created.user.id,
        status: membership.status ?? "active",
      })
      .select("id")
      .single();
    if (membershipError || !membershipRow) {
      throw new Error(`membership insert failed: ${membershipError?.message}`);
    }

    if (membership.role) {
      const { error: roleError } = await admin
        .from("membership_roles")
        .insert({ membership_id: membershipRow.id, role: membership.role });
      if (roleError) {
        throw new Error(`role insert failed: ${roleError.message}`);
      }
    }
  }

  return { id: created.user.id, email };
}

export async function signInAsMember(
  supabaseUrl: string,
  anonKey: string,
  email: string,
): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: EPHEMERAL_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  }
  return client;
}
