import { buildLegalEntityAuditEvent, buildPrivilegedBootstrapAuditEvent, buildTenantCreatedAuditEvent } from "./audit";
import { buildPlan } from "./plan";
import { evaluateTarget } from "./target";
import type {
  BootstrapRepository,
  DemoTenantIdentity,
  OwnerBootstrapIdentity,
  OwnerIdentityFields,
  Plan,
  PlanStep,
  ResolvedState,
  RunReport,
  StepId,
  StepJournalEntry,
  TargetDescriptor,
} from "./types";

export function buildExpectedConfirmationToken(target: TargetDescriptor, tenantSlug: string): string {
  return `${target.ref} ${tenantSlug}`;
}

interface RunBootstrapOptionsBase {
  repository: BootstrapRepository;
  target: TargetDescriptor;
  tenantIdentity: DemoTenantIdentity;
  // Only email/displayName — every branch up through plan-building is
  // read-only and never needs a password, dry-run or apply.
  identity: OwnerIdentityFields;
}

// Discriminated on `apply` so the password only exists on the type when
// apply=true — a dry-run RunBootstrapOptions is structurally incapable of
// carrying a password, the same way BootstrapRepository is structurally
// incapable of a destructive call (see types.ts).
export type RunBootstrapOptions =
  | (RunBootstrapOptionsBase & { apply: false })
  | (RunBootstrapOptionsBase & {
      apply: true;
      password: string;
      // Checked only once apply=true. Never derived automatically — the
      // caller (cli.ts) must have shown the operator the exact target and
      // gotten this back verbatim.
      confirmationToken?: string;
    });

// Executes one already-decided plan step against the repository, returning
// the concrete ids the step touched (used to build audit evidence after the
// whole run). Steps run strictly in order; a thrown error here stops the
// run — see runBootstrap's catch below.
async function executeStep(
  repository: BootstrapRepository,
  step: PlanStep,
  state: ResolvedState,
  input: OwnerBootstrapIdentity,
  tenantIdentity: DemoTenantIdentity,
  ctx: { tenantId?: string; legalEntityId?: string; userId?: string; membershipId?: string },
): Promise<void> {
  switch (step.id) {
    case "resolve_or_create_tenant": {
      if (step.action === "create") {
        const tenant = await repository.createTenant(tenantIdentity);
        ctx.tenantId = tenant.id;
      } else {
        ctx.tenantId = state.tenant?.id;
        if (step.action === "update" && ctx.tenantId) {
          await repository.updateTenantDisplayName(ctx.tenantId, tenantIdentity.displayName);
        }
      }
      return;
    }
    case "resolve_or_create_legal_entity": {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new Error("Cannot resolve legal entity without a resolved tenant.");
      }
      const existing = state.legalEntities[0] ?? null;
      if (step.action === "create") {
        const legalEntity = await repository.createLegalEntity(tenantId, tenantIdentity);
        ctx.legalEntityId = legalEntity.id;
      } else {
        ctx.legalEntityId = existing?.id;
        if (step.action === "update" && ctx.legalEntityId) {
          await repository.updateLegalEntity(ctx.legalEntityId, {
            legalName: tenantIdentity.legalName,
            displayName: tenantIdentity.legalDisplayName,
          });
        }
      }
      return;
    }
    case "resolve_or_create_auth_user": {
      if (step.action === "create") {
        const user = await repository.createAuthUser(input);
        ctx.userId = user.id;
      } else {
        ctx.userId = state.authUser?.id;
      }
      return;
    }
    case "ensure_active_membership": {
      const tenantId = ctx.tenantId;
      const userId = ctx.userId;
      if (!tenantId || !userId) {
        throw new Error("Cannot ensure membership without a resolved tenant and user.");
      }
      if (step.action === "create") {
        const membership = await repository.createMembership(tenantId, userId);
        ctx.membershipId = membership.id;
      } else {
        ctx.membershipId = state.membershipForUser?.id;
        if (step.action === "update" && ctx.membershipId) {
          await repository.activateMembership(ctx.membershipId);
        }
      }
      return;
    }
    case "ensure_owner_role": {
      if (!ctx.membershipId) {
        throw new Error("Cannot assign owner role without a resolved membership.");
      }
      if (step.action !== "noop") {
        await repository.addOwnerRole(ctx.membershipId);
      }
      return;
    }
    default:
      // "write_bootstrap_audit_evidence" is handled directly by
      // runPlanSteps() below — it needs the full applied-step list, which
      // is only complete once every prior step has run, so it never
      // reaches this generic dispatcher.
      return;
  }
}

async function runPlanSteps(
  repository: BootstrapRepository,
  plan: Plan,
  state: ResolvedState,
  input: OwnerBootstrapIdentity,
  tenantIdentity: DemoTenantIdentity,
  target: TargetDescriptor,
): Promise<RunReport> {
  const journal: StepJournalEntry[] = plan.steps.map((step) => ({ id: step.id, status: "pending" }));
  const ctx: { tenantId?: string; legalEntityId?: string; userId?: string; membershipId?: string } = {};
  const appliedStepIds: StepId[] = [];

  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];

    // The audit-evidence step needs the full applied-step list, which is
    // only complete once every prior step has run — handle it inline here
    // instead of inside executeStep().
    if (step.id === "write_bootstrap_audit_evidence") {
      if (step.action === "noop" || !ctx.tenantId) {
        journal[index] = { id: step.id, status: "completed" };
        continue;
      }
      try {
        const events = [buildPrivilegedBootstrapAuditEvent(ctx.tenantId, appliedStepIds, target.ref)];
        if (ctx.legalEntityId && plan.steps.some((s) => s.id === "resolve_or_create_legal_entity" && s.action !== "noop")) {
          events.push(
            buildLegalEntityAuditEvent(
              ctx.tenantId,
              ctx.legalEntityId,
              "create",
              null,
              { legal_name: tenantIdentity.legalName, display_name: tenantIdentity.legalDisplayName },
            ),
          );
        }
        if (plan.steps.some((s) => s.id === "resolve_or_create_tenant" && s.action === "create")) {
          events.push(buildTenantCreatedAuditEvent(ctx.tenantId, tenantIdentity.displayName));
        }
        await repository.writeAuditEvents(events);
        journal[index] = { id: step.id, status: "completed" };
        appliedStepIds.push(step.id);
      } catch (err) {
        journal[index] = { id: step.id, status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
        return buildAppliedReport(ctx.tenantId ?? state.tenant?.id, journal);
      }
      continue;
    }

    try {
      await executeStep(repository, step, state, input, tenantIdentity, ctx);
      journal[index] = { id: step.id, status: "completed" };
      if (step.action !== "noop") {
        appliedStepIds.push(step.id);
      }
    } catch (err) {
      journal[index] = { id: step.id, status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
      return buildAppliedReport(ctx.tenantId ?? state.tenant?.id, journal);
    }
  }

  return buildAppliedReport(ctx.tenantId ?? state.tenant?.id, journal);
}

function buildAppliedReport(tenantId: string | undefined, journal: StepJournalEntry[]): RunReport {
  const completed = journal.filter((e) => e.status === "completed").map((e) => e.id);
  const failed = journal.find((e) => e.status === "failed");
  const pending = journal.filter((e) => e.status === "pending").map((e) => e.id);
  return {
    kind: "applied",
    tenantId: tenantId ?? "",
    journal,
    completed,
    pending,
    failedAt: failed?.id,
    success: !failed,
  };
}

// Orchestrates one bootstrap run: guard the target, resolve live state,
// build a plan, and — only when apply=true and the confirmation token
// matches exactly — execute it. Every branch before "execute" is read-only;
// no repository mutation method is ever called on a dry run, a rejected
// target, a plan conflict, or a missing/mismatched confirmation.
export async function runBootstrap(options: RunBootstrapOptions): Promise<RunReport> {
  const guard = evaluateTarget(options.target);
  if (!guard.ok) {
    return { kind: "target_rejected", reason: guard.reason, detail: guard.detail };
  }

  const state = await options.repository.resolveState({
    email: options.identity.email,
    tenantSlug: options.tenantIdentity.slug,
  });

  const planResult = buildPlan(state, options.identity, options.tenantIdentity);
  if (planResult.kind === "conflict") {
    return { kind: "conflict", reason: planResult.reason, detail: planResult.detail };
  }

  if (!options.apply) {
    return { kind: "dry_run", plan: planResult };
  }

  const expectedToken = buildExpectedConfirmationToken(options.target, options.tenantIdentity.slug);
  if (options.confirmationToken !== expectedToken) {
    return { kind: "confirmation_required", expectedToken };
  }

  const input: OwnerBootstrapIdentity = { ...options.identity, password: options.password };
  return runPlanSteps(options.repository, planResult, state, input, options.tenantIdentity, options.target);
}
