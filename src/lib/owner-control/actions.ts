"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  approveExpenseSubmissionForActiveTenant,
  rejectExpenseSubmissionForActiveTenant,
  requestExpenseCorrectionForActiveTenant,
  type ExpenseSubmissionActionResult,
} from "@/lib/expense-approvals/service";
import {
  resolveExpenseDuplicateCandidateForActiveTenant,
  type ExpenseDuplicateCandidateActionResult,
} from "@/lib/expense-duplicate-detection/service";
import {
  approveCashReconciliationForActiveTenant,
  rejectCashReconciliationForActiveTenant,
  reopenCashPoolForActiveTenant,
  requestCashReconciliationCorrectionForActiveTenant,
  type CashPoolResult,
  type CashReconciliationResult,
} from "@/lib/cash-reconciliation/service";

const OWNER_CONTROL_PATH = "/owner/control";

// Every action below is a thin wrapper: it forwards only the fields a
// client legitimately supplies and lets the already-Zod-validated
// *ForActiveTenant service function do all input validation and role
// enforcement (owner-only, re-checked server-side). tenantId/actor/status
// are never read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

const GENERIC_VALIDATION_ERROR = "Data tidak valid. Silakan muat ulang halaman dan coba lagi.";

// A *ForActiveTenant service validates every field with Zod, including
// hidden/server-derived fields the UI never renders an input for. If one of
// those fails, `fieldErrors` carries a key no form component ever reads, so
// the failure would otherwise be silently dropped. Surface it as a
// generic, safe `error` instead — never the raw field name or schema
// message — while leaving fieldErrors for genuinely user-editable fields
// (e.g. `reason`) alone.
function surfaceHiddenFieldErrors<T extends { error?: string; fieldErrors?: Record<string, string[]> }>(
  result: T,
  visibleFields: readonly string[],
): T {
  if (!result.fieldErrors) {
    return result;
  }
  const hasHiddenFieldError = Object.keys(result.fieldErrors).some((key) => !visibleFields.includes(key));
  if (!hasHiddenFieldError) {
    return result;
  }
  return { ...result, error: result.error ?? GENERIC_VALIDATION_ERROR };
}

export async function approveExpenseSubmissionOwnerAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = surfaceHiddenFieldErrors(
      await approveExpenseSubmissionForActiveTenant({ submissionId: formData.get("submissionId") }),
      [],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function rejectExpenseSubmissionOwnerAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = surfaceHiddenFieldErrors(
      await rejectExpenseSubmissionForActiveTenant({
        submissionId: formData.get("submissionId"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function requestExpenseCorrectionOwnerAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = surfaceHiddenFieldErrors(
      await requestExpenseCorrectionForActiveTenant({
        submissionId: formData.get("submissionId"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function resolveExpenseDuplicateCandidateOwnerAction(
  _prevState: ExpenseDuplicateCandidateActionResult,
  formData: FormData,
): Promise<ExpenseDuplicateCandidateActionResult> {
  let result: ExpenseDuplicateCandidateActionResult;
  try {
    result = surfaceHiddenFieldErrors(
      await resolveExpenseDuplicateCandidateForActiveTenant({
        candidateId: formData.get("candidateId"),
        resolution: formData.get("resolution"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function approveCashReconciliationOwnerAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = surfaceHiddenFieldErrors(
      await approveCashReconciliationForActiveTenant({ reconciliationId: formData.get("reconciliationId") }),
      [],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function rejectCashReconciliationOwnerAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = surfaceHiddenFieldErrors(
      await rejectCashReconciliationForActiveTenant({
        reconciliationId: formData.get("reconciliationId"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function requestCashReconciliationCorrectionOwnerAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = surfaceHiddenFieldErrors(
      await requestCashReconciliationCorrectionForActiveTenant({
        reconciliationId: formData.get("reconciliationId"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}

export async function reopenCashPoolOwnerAction(
  _prevState: CashPoolResult,
  formData: FormData,
): Promise<CashPoolResult> {
  let result: CashPoolResult;
  try {
    result = surfaceHiddenFieldErrors(
      await reopenCashPoolForActiveTenant({
        poolId: formData.get("poolId"),
        reason: formData.get("reason"),
      }),
      ["reason"],
    );
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OWNER_CONTROL_PATH);
  }
  return result;
}
