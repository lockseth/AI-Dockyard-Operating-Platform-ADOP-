import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapExpenseApprovalError } from "./errors";
import {
  approveExpenseSubmission,
  cancelExpenseSubmission,
  createExpenseDraft,
  listExpenseSubmissionRevisions,
  listExpenseSubmissionsCurrentForTenant,
  listExpenseSubmissionStatusEvents,
  rejectExpenseSubmission,
  requestExpenseCorrection,
  reviseExpenseDraft,
  submitExpense,
  type ExpenseSubmissionCurrentRow,
  type ExpenseSubmissionRevisionRow,
  type ExpenseSubmissionRow,
  type ExpenseSubmissionStatusEventRow,
} from "./repository";
import {
  approveExpenseSubmissionInputSchema,
  cancelExpenseSubmissionInputSchema,
  createExpenseDraftInputSchema,
  rejectExpenseSubmissionInputSchema,
  requestExpenseCorrectionInputSchema,
  reviseExpenseDraftInputSchema,
  submitExpenseInputSchema,
} from "./validation";

export interface ExpenseApprovalActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ExpenseSubmissionActionResult extends ExpenseApprovalActionResult {
  submission?: ExpenseSubmissionRow;
}

export async function listExpenseSubmissionsForActiveTenant(): Promise<ExpenseSubmissionCurrentRow[]> {
  const context = await requireTenantContext();
  return listExpenseSubmissionsCurrentForTenant(context.tenantId);
}

export async function listExpenseSubmissionRevisionsForActiveTenant(
  submissionId: string,
): Promise<ExpenseSubmissionRevisionRow[]> {
  const context = await requireTenantContext();
  return listExpenseSubmissionRevisions(context.tenantId, submissionId);
}

export async function listExpenseSubmissionStatusEventsForActiveTenant(
  submissionId: string,
): Promise<ExpenseSubmissionStatusEventRow[]> {
  const context = await requireTenantContext();
  return listExpenseSubmissionStatusEvents(context.tenantId, submissionId);
}

export async function createExpenseDraftForActiveTenant(rawInput: unknown): Promise<ExpenseSubmissionActionResult> {
  const parsed = createExpenseDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await createExpenseDraft({
    tenantId: input.tenantId,
    poolId: input.poolId,
    projectId: input.projectId,
    categoryId: input.categoryId,
    amount: input.amount,
    description: input.description,
    vendorId: input.vendorId,
    referenceNumber: input.referenceNumber,
    entryScope: input.entryScope,
    facilityLocationId: input.facilityLocationId,
  });
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function reviseExpenseDraftForActiveTenant(rawInput: unknown): Promise<ExpenseSubmissionActionResult> {
  const parsed = reviseExpenseDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await reviseExpenseDraft({
    submissionId: input.submissionId,
    poolId: input.poolId,
    projectId: input.projectId,
    categoryId: input.categoryId,
    amount: input.amount,
    description: input.description,
    vendorId: input.vendorId,
    referenceNumber: input.referenceNumber,
    entryScope: input.entryScope,
    facilityLocationId: input.facilityLocationId,
  });
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function submitExpenseForActiveTenant(rawInput: unknown): Promise<ExpenseSubmissionActionResult> {
  const parsed = submitExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await submitExpense(input.submissionId);
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function approveExpenseSubmissionForActiveTenant(
  rawInput: unknown,
): Promise<ExpenseSubmissionActionResult> {
  const parsed = approveExpenseSubmissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await approveExpenseSubmission(input.submissionId);
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function rejectExpenseSubmissionForActiveTenant(
  rawInput: unknown,
): Promise<ExpenseSubmissionActionResult> {
  const parsed = rejectExpenseSubmissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await rejectExpenseSubmission(input.submissionId, input.reason);
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function requestExpenseCorrectionForActiveTenant(
  rawInput: unknown,
): Promise<ExpenseSubmissionActionResult> {
  const parsed = requestExpenseCorrectionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await requestExpenseCorrection(input.submissionId, input.reason);
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}

export async function cancelExpenseSubmissionForActiveTenant(rawInput: unknown): Promise<ExpenseSubmissionActionResult> {
  const parsed = cancelExpenseSubmissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await cancelExpenseSubmission(input.submissionId, input.reason);
  if (error || !data) {
    return { error: mapExpenseApprovalError(error) };
  }

  return { submission: data };
}
