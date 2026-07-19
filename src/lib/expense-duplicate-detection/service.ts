import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapExpenseDuplicateDetectionError } from "./errors";
import {
  listExpenseDuplicateCandidateResolutionEvents,
  listExpenseDuplicateCandidatesForSubmission,
  listPendingExpenseDuplicateCandidatesForTenant,
  resolveExpenseDuplicateCandidate,
  type ExpenseDuplicateCandidateCurrentRow,
  type ExpenseDuplicateCandidateResolutionEventRow,
  type ExpenseDuplicateCandidateRow,
} from "./repository";
import {
  listExpenseDuplicateCandidatesForSubmissionInputSchema,
  resolveExpenseDuplicateCandidateInputSchema,
} from "./validation";

export interface ExpenseDuplicateActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ExpenseDuplicateCandidateActionResult extends ExpenseDuplicateActionResult {
  candidate?: ExpenseDuplicateCandidateRow;
}

// RLS is the final enforcement layer for visibility (owner/admin/reviewer
// only, viewer excluded) — no additional role check needed here, matching
// the list functions in expense-approvals/service.ts.
export async function listPendingExpenseDuplicateCandidatesForActiveTenant(): Promise<
  ExpenseDuplicateCandidateCurrentRow[]
> {
  const context = await requireTenantContext();
  return listPendingExpenseDuplicateCandidatesForTenant(context.tenantId);
}

export async function listExpenseDuplicateCandidatesForSubmissionForActiveTenant(
  rawInput: unknown,
): Promise<ExpenseDuplicateCandidateCurrentRow[]> {
  const parsed = listExpenseDuplicateCandidatesForSubmissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [];
  }

  const context = await requireTenantContext();
  return listExpenseDuplicateCandidatesForSubmission(context.tenantId, parsed.data.submissionId);
}

export async function listExpenseDuplicateCandidateResolutionEventsForActiveTenant(
  candidateId: string,
): Promise<ExpenseDuplicateCandidateResolutionEventRow[]> {
  const context = await requireTenantContext();
  return listExpenseDuplicateCandidateResolutionEvents(context.tenantId, candidateId);
}

export async function resolveExpenseDuplicateCandidateForActiveTenant(
  rawInput: unknown,
): Promise<ExpenseDuplicateCandidateActionResult> {
  const parsed = resolveExpenseDuplicateCandidateInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await resolveExpenseDuplicateCandidate(input);
  if (error || !data) {
    return { error: mapExpenseDuplicateDetectionError(error) };
  }

  return { candidate: data };
}
