import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type AssistantChannelIdentityRow = Tables<"assistant_channel_identities">;

// The digest is deliberately excluded — see the select() below.
export type AssistantChannelIdentitySummaryRow = Omit<AssistantChannelIdentityRow, "challenge_digest">;

// Authenticated-session RPCs only (the "issue"/"revoke"/"reset" side of the
// contract — a browser user acting for themselves or, for revoke, for
// another member of their own tenant). The "complete" side (a WhatsApp
// reply, not a browser session) lives in admin-repository.ts.

export async function issuePairingChallenge(params: {
  tenantId: string;
  channel: string;
  normalizedAddress: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("assistant_issue_pairing_challenge", {
    p_tenant_id: params.tenantId,
    p_channel: params.channel,
    p_normalized_address: params.normalizedAddress,
  });
}

export async function revokePairing(params: { identityId: string; reason?: string }) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("assistant_revoke_pairing", {
    p_identity_id: params.identityId,
    p_reason: params.reason,
  });
}

export async function issueClientVerificationChallenge(params: { contactId: string }) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("assistant_issue_client_verification_challenge", {
    p_contact_id: params.contactId,
  });
}

export async function resetClientVerification(params: { contactId: string; reason?: string }) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("assistant_reset_client_verification", {
    p_contact_id: params.contactId,
    p_reason: params.reason,
  });
}

// RLS-scoped read: the row's own owner, or owner/admin of its tenant.
// challenge_digest is never selectable at the grant level, so `select("*")`
// would fail outright with "permission denied for column challenge_digest"
// — this must list every OTHER column explicitly instead, matching the
// migration's `grant select (...)` column list exactly. The literal is
// inlined (not a shared const) so supabase-js can infer the row shape from
// the string itself.
export async function listAssistantChannelIdentitiesForTenant(
  tenantId: string,
): Promise<AssistantChannelIdentitySummaryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("assistant_channel_identities")
    .select(
      "id, tenant_id, user_id, channel, normalized_address, status, challenge_expires_at, challenge_attempt_count, verified_at, revoked_at, revoked_by, revoked_reason, created_by, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
