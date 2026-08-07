import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashBootstrapToken } from "./token";
import type { ClaimFailureReason, ClaimResult, ResolvedBootstrapClaim } from "./types";

// Service-role boundary for the claim side of this module (issuance-
// repository.ts is the equivalent boundary for the CLI side) — enforced by
// admin-client-only.test.ts. Both RPCs this file calls are granted to
// service_role only (see the migration), which is the only reason this can
// run pre-session: there is no auth.uid() to authorize against yet.

const RPC_ERROR_REASON: Record<string, ClaimFailureReason> = {
  P0002: "invalid_or_expired",
  P0010: "tenant_already_has_owner",
  P0011: "email_mismatch",
  P0012: "token_already_claimed",
  P0013: "partial_state_conflict",
};

function mapRpcErrorCode(code: string | undefined): ClaimFailureReason {
  if (!code) {
    return "unknown";
  }
  return RPC_ERROR_REASON[code] ?? "unknown";
}

// Read-only — used both by the claim page's initial render and again,
// freshly, inside performBootstrapClaim right before creating the auth
// user (never trusts this first call's result for the actual write).
export async function resolveBootstrapClaim(rawToken: string): Promise<ResolvedBootstrapClaim | null> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashBootstrapToken(rawToken);

  const { data, error } = await admin
    .rpc("resolve_first_owner_bootstrap_token", { p_token_hash: tokenHash })
    .single();

  if (error || !data) {
    return null;
  }

  return {
    tokenId: data.token_id,
    tenantId: data.tenant_id,
    tenantDisplayName: data.tenant_display_name ?? "",
    email: data.email,
  };
}

export async function performBootstrapClaim(rawToken: string, password: string): Promise<ClaimResult> {
  const admin = createSupabaseAdminClient();
  const tokenHash = hashBootstrapToken(rawToken);

  // Deliberately NOT resolveBootstrapClaim (the pending-only RPC used by
  // the GET page): a genuine idempotent replay of an already-completed
  // claim (doubled form submit, client retry after a lost response) must
  // still be able to reach claim_first_owner_bootstrap's own idempotent-
  // retry branch below, which requires knowing the target email even when
  // status is already 'claimed'. service_role bypasses RLS (and this table
  // has no policy at all — see the migration), so this direct read is safe
  // and does not need to go through an RPC.
  const { data: tokenRow, error: tokenError } = await admin
    .from("first_owner_bootstrap_tokens")
    .select("email, status, expires_at, claimed_by")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    tokenError ||
    !tokenRow ||
    tokenRow.status === "revoked" ||
    new Date(tokenRow.expires_at).getTime() < Date.now()
  ) {
    return { ok: false, reason: "invalid_or_expired" };
  }

  let userId: string;

  if (tokenRow.status === "claimed") {
    // Replay path: skip admin.createUser entirely (it would fail — the
    // account already exists) and let claim_first_owner_bootstrap's own
    // idempotent-retry branch decide whether this is the same claimant
    // (returns the same membership) or a genuine conflict (a claimed token
    // being claimed again by someone else — rejected by the RPC itself).
    if (!tokenRow.claimed_by) {
      return { ok: false, reason: "unknown" };
    }
    userId = tokenRow.claimed_by;
  } else {
    // status === 'pending' here. Creating the auth.users row is only
    // reachable via the service-role Admin API — there is no session yet
    // for supabase.auth.signUp()/updateUser() to work against. If this
    // email already has an account (a genuine pre-existing one, a prior
    // partial attempt's artifact, or the loser of a genuinely concurrent
    // claim race — auth.users' own email uniqueness constraint is what
    // decides that race, not this code), createUser fails and this returns
    // partial_state_conflict rather than silently taking over or resetting
    // an unrelated account's password — recovery from that state is an
    // explicit operator action (revoke + reissue), not something this flow
    // auto-heals.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: tokenRow.email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return { ok: false, reason: "partial_state_conflict" };
    }
    userId = created.user.id;
  }

  const { data: claimed, error: claimError } = await admin
    .rpc("claim_first_owner_bootstrap", { p_token_hash: tokenHash, p_user_id: userId })
    .single();

  if (claimError || !claimed) {
    return { ok: false, reason: mapRpcErrorCode(claimError?.code) };
  }

  return {
    ok: true,
    tenantId: claimed.tenant_id,
    membershipId: claimed.membership_id,
    email: tokenRow.email,
  };
}
