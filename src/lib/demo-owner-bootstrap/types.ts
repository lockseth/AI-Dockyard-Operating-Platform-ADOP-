import type { Enums, TablesInsert } from "@/types/database";

export type TenantRole = Enums<"tenant_role">;
export type TenantStatus = Enums<"tenant_status">;
export type MembershipStatus = Enums<"membership_status">;
export type LegalEntityStatus = Enums<"legal_entity_status">;

export interface TargetDescriptor {
  ref: string;
  url: string;
}

export interface DemoTenantIdentity {
  slug: string;
  displayName: string;
  legalName: string;
  legalDisplayName: string;
}

export interface OwnerBootstrapIdentity {
  email: string;
  displayName: string;
  password: string;
}

// --- Resolved state (read-only lookups against the target project) --------

export interface ResolvedTenantRow {
  id: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
}

export interface ResolvedLegalEntityRow {
  id: string;
  tenantId: string;
  legalName: string | null;
  displayName: string;
  status: LegalEntityStatus;
}

export interface ResolvedAuthUserRow {
  id: string;
  email: string;
}

export interface ResolvedMembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  roles: TenantRole[];
}

export interface ResolvedOwnerRow {
  userId: string;
  membershipId: string;
}

// Everything the planner needs to decide what (if anything) must change.
// Populated entirely by read-only queries — resolving state never mutates.
export interface ResolvedState {
  tenant: ResolvedTenantRow | null;
  // Active legal entities under the tenant. Normally 0 or 1; more than one
  // means resolving "the" legal entity is ambiguous.
  legalEntities: ResolvedLegalEntityRow[];
  authUser: ResolvedAuthUserRow | null;
  membershipForUser: ResolvedMembershipRow | null;
  // An active membership tenant_id this user already holds that is NOT the
  // target tenant — signals the email is already bound elsewhere.
  otherActiveTenantIdForUser: string | null;
  // Active owner memberships in the target tenant, for any user.
  existingOwners: ResolvedOwnerRow[];
}

// --- Plan ------------------------------------------------------------------

export type StepId =
  | "resolve_or_create_tenant"
  | "resolve_or_create_legal_entity"
  | "resolve_or_create_auth_user"
  | "ensure_active_membership"
  | "ensure_owner_role"
  | "write_bootstrap_audit_evidence";

export type StepAction = "noop" | "create" | "update";

export interface PlanStep {
  id: StepId;
  action: StepAction;
  detail: string;
}

export type ConflictReason =
  | "email_bound_to_other_tenant"
  | "legal_entity_mismatch"
  | "membership_role_conflict"
  | "ambiguous_multiple_matches";

export interface PlanConflict {
  kind: "conflict";
  reason: ConflictReason;
  detail: string;
}

export interface Plan {
  kind: "plan";
  steps: PlanStep[];
  allNoop: boolean;
}

export type PlanResult = Plan | PlanConflict;

// --- Journal / run report ---------------------------------------------------

export type StepJournalStatus = "completed" | "failed" | "pending";

export interface StepJournalEntry {
  id: StepId;
  status: StepJournalStatus;
  // Sanitized only — never a raw driver error containing request payloads.
  error?: string;
}

export type RunReport =
  | { kind: "target_rejected"; reason: string; detail: string }
  | { kind: "conflict"; reason: ConflictReason; detail: string }
  | { kind: "dry_run"; plan: Plan }
  | { kind: "confirmation_required"; expectedToken: string }
  | {
      kind: "applied";
      tenantId: string;
      journal: StepJournalEntry[];
      completed: StepId[];
      pending: StepId[];
      failedAt?: StepId;
      success: boolean;
    };

// --- Repository boundary ----------------------------------------------------
// Deliberately has no delete/reset/truncate method — the executor can only
// ever call what is declared here, so it is structurally incapable of
// issuing a destructive operation regardless of what a step handler does.
export interface BootstrapRepository {
  resolveState(input: { email: string; tenantSlug: string }): Promise<ResolvedState>;
  createTenant(identity: DemoTenantIdentity): Promise<ResolvedTenantRow>;
  updateTenantDisplayName(tenantId: string, displayName: string): Promise<void>;
  createLegalEntity(
    tenantId: string,
    identity: DemoTenantIdentity,
  ): Promise<ResolvedLegalEntityRow>;
  updateLegalEntity(
    legalEntityId: string,
    patch: { legalName?: string; displayName?: string },
  ): Promise<void>;
  createAuthUser(input: OwnerBootstrapIdentity): Promise<ResolvedAuthUserRow>;
  createMembership(tenantId: string, userId: string): Promise<ResolvedMembershipRow>;
  activateMembership(membershipId: string): Promise<void>;
  addOwnerRole(membershipId: string): Promise<void>;
  writeAuditEvents(events: TablesInsert<"access_audit_events">[]): Promise<void>;
}
