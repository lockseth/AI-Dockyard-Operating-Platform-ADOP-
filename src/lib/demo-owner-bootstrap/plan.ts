import type {
  DemoTenantIdentity,
  OwnerIdentityFields,
  Plan,
  PlanConflict,
  PlanResult,
  PlanStep,
  ResolvedLegalEntityRow,
  ResolvedMembershipRow,
  ResolvedState,
  ResolvedTenantRow,
} from "./types";

function conflict(reason: PlanConflict["reason"], detail: string): PlanConflict {
  return { kind: "conflict", reason, detail };
}

function tenantStep(tenant: ResolvedTenantRow | null, identity: DemoTenantIdentity): PlanStep {
  if (!tenant) {
    return {
      id: "resolve_or_create_tenant",
      action: "create",
      detail: `Create tenant "${identity.displayName}" (slug: ${identity.slug}).`,
    };
  }
  if (tenant.displayName !== identity.displayName) {
    return {
      id: "resolve_or_create_tenant",
      action: "update",
      detail: "Update tenant display_name to match the locked demo identity.",
    };
  }
  return {
    id: "resolve_or_create_tenant",
    action: "noop",
    detail: "Tenant already resolved and matches the locked demo identity.",
  };
}

function legalEntityStep(
  legalEntity: ResolvedLegalEntityRow | null,
  identity: DemoTenantIdentity,
): PlanStep {
  if (!legalEntity) {
    return {
      id: "resolve_or_create_legal_entity",
      action: "create",
      detail: `Create legal entity "${identity.legalName}".`,
    };
  }
  if (legalEntity.legalName === null || legalEntity.displayName !== identity.legalDisplayName) {
    return {
      id: "resolve_or_create_legal_entity",
      action: "update",
      detail: "Fill in legal entity legal_name/display_name to match the locked demo identity.",
    };
  }
  return {
    id: "resolve_or_create_legal_entity",
    action: "noop",
    detail: "Legal entity already resolved and matches the locked demo identity.",
  };
}

function authUserStep(state: ResolvedState): PlanStep {
  if (!state.authUser) {
    return {
      id: "resolve_or_create_auth_user",
      action: "create",
      detail: "Create the internal Founder owner auth user.",
    };
  }
  // Never touch an existing user's password/attributes here — reset is an
  // explicit, separate, out-of-scope action (see requirement §5).
  return {
    id: "resolve_or_create_auth_user",
    action: "noop",
    detail: "Auth user already exists for this email; not modified.",
  };
}

function membershipStep(membership: ResolvedMembershipRow | null): PlanStep {
  if (!membership) {
    return {
      id: "ensure_active_membership",
      action: "create",
      detail: "Create an active tenant membership for the owner.",
    };
  }
  if (membership.status !== "active") {
    return {
      id: "ensure_active_membership",
      action: "update",
      detail: `Activate existing membership (currently "${membership.status}").`,
    };
  }
  return {
    id: "ensure_active_membership",
    action: "noop",
    detail: "Membership already active.",
  };
}

function ownerRoleStep(membership: ResolvedMembershipRow | null): PlanStep {
  if (membership && membership.roles.includes("owner")) {
    return {
      id: "ensure_owner_role",
      action: "noop",
      detail: "Owner role already assigned.",
    };
  }
  return {
    id: "ensure_owner_role",
    action: "create",
    detail: "Assign owner role to the membership.",
  };
}

// Pure planner: given read-only resolved state and the requested identity,
// decide the smallest idempotent set of steps, or refuse with a specific
// conflict reason when the target state is ambiguous. Never mutates
// anything and never receives a live client — see repository.ts for the I/O
// boundary this feeds. Takes OwnerIdentityFields (no password) since
// planning never needs the secret — only the apply-time executor does.
export function buildPlan(
  state: ResolvedState,
  input: OwnerIdentityFields,
  tenantIdentity: DemoTenantIdentity,
): PlanResult {
  if (state.legalEntities.length > 1) {
    return conflict(
      "ambiguous_multiple_matches",
      "More than one active legal entity already exists for this tenant.",
    );
  }

  if (state.authUser && state.otherActiveTenantIdForUser) {
    return conflict(
      "email_bound_to_other_tenant",
      `This email is already an active member of a different tenant (${state.otherActiveTenantIdForUser}).`,
    );
  }

  if (state.membershipForUser?.status === "suspended") {
    return conflict(
      "membership_role_conflict",
      "Existing membership for this email is suspended; requires human review before bootstrapping.",
    );
  }

  const distinctOwnerUserIds = [...new Set(state.existingOwners.map((owner) => owner.userId))];
  if (distinctOwnerUserIds.length > 0) {
    const soleOwnerId = distinctOwnerUserIds.length === 1 ? distinctOwnerUserIds[0] : null;
    const soleOwnerIsTargetUser = state.authUser !== null && soleOwnerId === state.authUser.id;
    if (!soleOwnerIsTargetUser) {
      return conflict(
        "membership_role_conflict",
        "Tenant already has a different active owner assigned.",
      );
    }
  }

  const legalEntity = state.legalEntities[0] ?? null;
  if (legalEntity && legalEntity.legalName !== null && legalEntity.legalName !== tenantIdentity.legalName) {
    return conflict(
      "legal_entity_mismatch",
      "Existing legal entity legal_name does not match the locked demo tenant identity.",
    );
  }

  const substantiveSteps: PlanStep[] = [
    tenantStep(state.tenant, tenantIdentity),
    legalEntityStep(legalEntity, tenantIdentity),
    authUserStep(state),
    membershipStep(state.membershipForUser),
    ownerRoleStep(state.membershipForUser),
  ];

  const changed = substantiveSteps.some((step) => step.action !== "noop");
  const auditStep: PlanStep = {
    id: "write_bootstrap_audit_evidence",
    action: changed ? "create" : "noop",
    detail: changed
      ? "Append privileged bootstrap audit evidence for this run."
      : "No changes made; no new audit evidence required.",
  };

  const steps = [...substantiveSteps, auditStep];

  const plan: Plan = {
    kind: "plan",
    steps,
    allNoop: steps.every((step) => step.action === "noop"),
  };
  return plan;
}
