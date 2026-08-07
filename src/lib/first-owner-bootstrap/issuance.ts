import type { IssuancePlan, ResolvedIssuanceState } from "./types";

// Pure planner: given read-only resolved state, decide what the issuance
// repository should do next, or refuse with a specific conflict. Never
// mutates and never receives a live client — mirrors demo-owner-bootstrap's
// plan.ts/executor.ts split so I/O stays isolated and this stays unit
// testable without a database.
export function planIssuance(state: ResolvedIssuanceState): IssuancePlan {
  if (!state.tenant) {
    return { kind: "create_tenant" };
  }

  if (state.tenantHasActiveOwner) {
    return {
      kind: "conflict",
      reason: "tenant_already_has_owner",
      detail: `Tenant "${state.tenant.displayName}" already has an active owner — refusing to issue a new first-owner bootstrap link.`,
    };
  }

  return { kind: "reissue", tenantId: state.tenant.id, revokeTokenId: state.pendingTokenId };
}
