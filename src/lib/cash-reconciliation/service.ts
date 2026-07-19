import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import type { CashPoolRow } from "@/lib/cash-pool/repository";
import { mapCashReconciliationError } from "./errors";
import {
  approveCashReconciliation,
  createCashReconciliationDraft,
  getCashPoolReconciliationCurrentForPool,
  getUnresolvedExpenseCount,
  listCashPoolReconciliationsCurrentForTenant,
  listCashPoolReopenEvents,
  listCashReconciliationRevisions,
  listCashReconciliationStatusEvents,
  rejectCashReconciliation,
  reopenCashPool,
  requestCashReconciliationCorrection,
  reviseCashReconciliationDraft,
  submitCashReconciliation,
  type CashPoolReconciliationCurrentRow,
  type CashPoolReopenEventRow,
  type CashReconciliationRevisionRow,
  type CashReconciliationRow,
  type CashReconciliationStatusEventRow,
} from "./repository";
import {
  approveCashReconciliationInputSchema,
  createCashReconciliationDraftInputSchema,
  rejectCashReconciliationInputSchema,
  reopenCashPoolInputSchema,
  requestCashReconciliationCorrectionInputSchema,
  reviseCashReconciliationDraftInputSchema,
  submitCashReconciliationInputSchema,
} from "./validation";

export interface CashReconciliationActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface CashReconciliationResult extends CashReconciliationActionResult {
  reconciliation?: CashReconciliationRow;
}

export interface CashPoolResult extends CashReconciliationActionResult {
  pool?: CashPoolRow;
}

export async function listCashPoolReconciliationsForActiveTenant(): Promise<CashPoolReconciliationCurrentRow[]> {
  const context = await requireTenantContext();
  return listCashPoolReconciliationsCurrentForTenant(context.tenantId);
}

export async function getCashPoolReconciliationForActiveTenant(
  poolId: string,
): Promise<CashPoolReconciliationCurrentRow | null> {
  const context = await requireTenantContext();
  return getCashPoolReconciliationCurrentForPool(context.tenantId, poolId);
}

export async function listCashReconciliationRevisionsForActiveTenant(
  reconciliationId: string,
): Promise<CashReconciliationRevisionRow[]> {
  const context = await requireTenantContext();
  return listCashReconciliationRevisions(context.tenantId, reconciliationId);
}

export async function listCashReconciliationStatusEventsForActiveTenant(
  reconciliationId: string,
): Promise<CashReconciliationStatusEventRow[]> {
  const context = await requireTenantContext();
  return listCashReconciliationStatusEvents(context.tenantId, reconciliationId);
}

export async function listCashPoolReopenEventsForActiveTenant(poolId: string): Promise<CashPoolReopenEventRow[]> {
  const context = await requireTenantContext();
  return listCashPoolReopenEvents(context.tenantId, poolId);
}

// Explains why EOD close is blocked by Gate 1G.1's unresolved-expense guard
// — any active tenant member can read this (matches expense_submissions'
// own read visibility).
export async function getUnresolvedExpenseCountForActiveTenant(poolId: string): Promise<number> {
  await requireTenantContext();
  const { data, error } = await getUnresolvedExpenseCount(poolId);
  if (error) throw error;
  return data ?? 0;
}

export async function createCashReconciliationDraftForActiveTenant(
  rawInput: unknown,
): Promise<CashReconciliationResult> {
  const parsed = createCashReconciliationDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await createCashReconciliationDraft({
    poolId: input.poolId,
    actualCountedCash: input.actualCountedCash,
    explanation: input.explanation,
  });
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

export async function reviseCashReconciliationDraftForActiveTenant(
  rawInput: unknown,
): Promise<CashReconciliationResult> {
  const parsed = reviseCashReconciliationDraftInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await reviseCashReconciliationDraft({
    reconciliationId: input.reconciliationId,
    actualCountedCash: input.actualCountedCash,
    explanation: input.explanation,
  });
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

export async function submitCashReconciliationForActiveTenant(rawInput: unknown): Promise<CashReconciliationResult> {
  const parsed = submitCashReconciliationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await submitCashReconciliation(input.reconciliationId);
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

export async function approveCashReconciliationForActiveTenant(rawInput: unknown): Promise<CashReconciliationResult> {
  const parsed = approveCashReconciliationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await approveCashReconciliation(input.reconciliationId);
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

export async function rejectCashReconciliationForActiveTenant(rawInput: unknown): Promise<CashReconciliationResult> {
  const parsed = rejectCashReconciliationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await rejectCashReconciliation(input.reconciliationId, input.reason);
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

export async function requestCashReconciliationCorrectionForActiveTenant(
  rawInput: unknown,
): Promise<CashReconciliationResult> {
  const parsed = requestCashReconciliationCorrectionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await requestCashReconciliationCorrection(input.reconciliationId, input.reason);
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { reconciliation: data };
}

// Owner-only — matches the reopen_cash_pool RPC's own role check.
export async function reopenCashPoolForActiveTenant(rawInput: unknown): Promise<CashPoolResult> {
  const parsed = reopenCashPoolInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await reopenCashPool(input.poolId, input.reason);
  if (error || !data) {
    return { error: mapCashReconciliationError(error) };
  }

  return { pool: data };
}
