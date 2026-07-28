import type { Json, TablesInsert } from "@/types/database";
import type { StepId } from "./types";

type AccessAuditEventInsert = TablesInsert<"access_audit_events">;

// actor_user_id is always null here: these events are written by the
// service-role bootstrap harness, which never runs with a caller session
// (auth.uid() would be null in the database too — see
// private.record_membership_audit() in 20260722030000_user_management.sql
// for the equivalent pattern on the automatic membership/role triggers).

export function buildTenantCreatedAuditEvent(tenantId: string, displayName: string): AccessAuditEventInsert {
  return {
    tenant_id: tenantId,
    actor_user_id: null,
    entity_type: "tenant",
    entity_id: tenantId,
    action: "create",
    before_data: null,
    after_data: { display_name: displayName },
  };
}

export function buildLegalEntityAuditEvent(
  tenantId: string,
  legalEntityId: string,
  action: "create" | "update",
  before: Json | null,
  after: Json,
): AccessAuditEventInsert {
  return {
    tenant_id: tenantId,
    actor_user_id: null,
    entity_type: "legal_entity",
    entity_id: legalEntityId,
    action,
    before_data: before,
    after_data: after,
  };
}

// One summary event per apply run that made any change — the durable record
// of "this privileged harness ran against this tenant". Deliberately never
// includes email, password, or any secret: only step ids/actions, which are
// safe to store and safe to display back in a completion report.
export function buildPrivilegedBootstrapAuditEvent(
  tenantId: string,
  appliedStepIds: StepId[],
  targetRef: string,
): AccessAuditEventInsert {
  return {
    tenant_id: tenantId,
    actor_user_id: null,
    entity_type: "tenant",
    entity_id: tenantId,
    action: "privileged_bootstrap_run",
    before_data: null,
    after_data: { applied_steps: appliedStepIds, target_ref: targetRef },
  };
}
