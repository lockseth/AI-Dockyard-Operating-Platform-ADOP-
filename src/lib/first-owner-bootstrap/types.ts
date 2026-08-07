// --- Issuance (Founder/operator CLI) ----------------------------------------

export interface IssuanceInput {
  tenantSlug: string;
  tenantDisplayName: string;
  email: string;
}

export interface ResolvedTenantForIssuance {
  id: string;
  displayName: string;
}

// Everything the pure planner needs, from read-only lookups only.
export interface ResolvedIssuanceState {
  tenant: ResolvedTenantForIssuance | null;
  tenantHasActiveOwner: boolean;
  // A still-pending, unexpired token for this tenant, if any — reissuing
  // must revoke it first so at most one live claim link ever exists per
  // tenant (also enforced in the database by a partial unique index).
  pendingTokenId: string | null;
}

export type IssuancePlan =
  | { kind: "create_tenant" }
  | { kind: "reissue"; tenantId: string; revokeTokenId: string | null }
  | { kind: "conflict"; reason: "tenant_already_has_owner"; detail: string };

export interface IssuedBootstrapLink {
  tenantId: string;
  tokenId: string;
  // Raw token — exists only here, in memory, for exactly long enough to be
  // printed once by the CLI. Never returned from any RPC, never logged.
  rawToken: string;
  expiresAt: string;
}

// --- Claim (public, pre-session, Server Action) -----------------------------

export interface ResolvedBootstrapClaim {
  tokenId: string;
  tenantId: string;
  tenantDisplayName: string;
  email: string;
}

export type ClaimFailureReason =
  | "invalid_or_expired"
  | "tenant_already_has_owner"
  | "token_already_claimed"
  | "email_mismatch"
  | "partial_state_conflict"
  | "unknown";

export interface ClaimSuccess {
  ok: true;
  tenantId: string;
  membershipId: string;
  email: string;
}

export interface ClaimFailure {
  ok: false;
  reason: ClaimFailureReason;
}

export type ClaimResult = ClaimSuccess | ClaimFailure;
