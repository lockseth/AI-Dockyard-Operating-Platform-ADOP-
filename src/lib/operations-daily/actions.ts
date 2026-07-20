"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext, UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  ensureDailyCashPoolForActiveTenant,
  recordCashPoolEntryForActiveTenant,
  type EnsureDailyCashPoolResult,
  type RecordCashPoolEntryResult,
} from "@/lib/cash-pool/service";
import {
  cancelExpenseSubmissionForActiveTenant,
  createExpenseDraftForActiveTenant,
  reviseExpenseDraftForActiveTenant,
  submitExpenseForActiveTenant,
  type ExpenseSubmissionActionResult,
} from "@/lib/expense-approvals/service";
import {
  createCashReconciliationDraftForActiveTenant,
  reviseCashReconciliationDraftForActiveTenant,
  submitCashReconciliationForActiveTenant,
  type CashReconciliationResult,
} from "@/lib/cash-reconciliation/service";

const DAILY_OPERATIONS_PATH = "/operations/daily";

// Every action below is a thin wrapper: it re-derives the tenant/actor
// server-side, forwards only the fields a client legitimately supplies, and
// lets the already-Zod-validated *ForActiveTenant service function do all
// input validation and role enforcement. tenant_id/actor/status are never
// read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

function optionalField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export async function ensureDailyCashPoolAction(
  _prevState: EnsureDailyCashPoolResult,
  formData: FormData,
): Promise<EnsureDailyCashPoolResult> {
  let result: EnsureDailyCashPoolResult;
  try {
    result = await ensureDailyCashPoolForActiveTenant({
      businessDate: formData.get("businessDate"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function recordCashPoolEntryAction(
  _prevState: RecordCashPoolEntryResult,
  formData: FormData,
): Promise<RecordCashPoolEntryResult> {
  let result: RecordCashPoolEntryResult;
  try {
    result = await recordCashPoolEntryForActiveTenant({
      poolId: formData.get("poolId"),
      entryType: formData.get("entryType"),
      amount: formData.get("amount"),
      description: optionalField(formData, "description"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function createExpenseDraftAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    const context = await requireTenantContext();
    result = await createExpenseDraftForActiveTenant({
      tenantId: context.tenantId,
      poolId: formData.get("poolId"),
      projectId: formData.get("projectId"),
      categoryId: formData.get("categoryId"),
      amount: formData.get("amount"),
      description: formData.get("description"),
      vendorId: optionalField(formData, "vendorId"),
      referenceNumber: optionalField(formData, "referenceNumber"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function reviseExpenseDraftAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = await reviseExpenseDraftForActiveTenant({
      submissionId: formData.get("submissionId"),
      poolId: formData.get("poolId"),
      projectId: formData.get("projectId"),
      categoryId: formData.get("categoryId"),
      amount: formData.get("amount"),
      description: formData.get("description"),
      vendorId: optionalField(formData, "vendorId"),
      referenceNumber: optionalField(formData, "referenceNumber"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function submitExpenseAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = await submitExpenseForActiveTenant({
      submissionId: formData.get("submissionId"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function cancelExpenseSubmissionAction(
  _prevState: ExpenseSubmissionActionResult,
  formData: FormData,
): Promise<ExpenseSubmissionActionResult> {
  let result: ExpenseSubmissionActionResult;
  try {
    result = await cancelExpenseSubmissionForActiveTenant({
      submissionId: formData.get("submissionId"),
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function createCashReconciliationDraftAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = await createCashReconciliationDraftForActiveTenant({
      poolId: formData.get("poolId"),
      actualCountedCash: formData.get("actualCountedCash"),
      explanation: optionalField(formData, "explanation"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function reviseCashReconciliationDraftAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = await reviseCashReconciliationDraftForActiveTenant({
      reconciliationId: formData.get("reconciliationId"),
      actualCountedCash: formData.get("actualCountedCash"),
      explanation: optionalField(formData, "explanation"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}

export async function submitCashReconciliationAction(
  _prevState: CashReconciliationResult,
  formData: FormData,
): Promise<CashReconciliationResult> {
  let result: CashReconciliationResult;
  try {
    result = await submitCashReconciliationForActiveTenant({
      reconciliationId: formData.get("reconciliationId"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(DAILY_OPERATIONS_PATH);
  }
  return result;
}
