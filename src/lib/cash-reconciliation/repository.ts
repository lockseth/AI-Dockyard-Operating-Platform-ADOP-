import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type CashReconciliationRow = Tables<"cash_reconciliations">;
export type CashReconciliationRevisionRow = Tables<"cash_reconciliation_revisions">;
export type CashReconciliationStatusEventRow = Tables<"cash_reconciliation_status_events">;
export type CashPoolReopenEventRow = Tables<"cash_pool_reopen_events">;
export type CashPoolReconciliationCurrentRow = Tables<"cash_pool_reconciliation_current">;

export async function listCashPoolReconciliationsCurrentForTenant(
  tenantId: string,
): Promise<CashPoolReconciliationCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pool_reconciliation_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCashPoolReconciliationCurrentForPool(
  tenantId: string,
  poolId: string,
): Promise<CashPoolReconciliationCurrentRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pool_reconciliation_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listCashReconciliationRevisions(
  tenantId: string,
  reconciliationId: string,
): Promise<CashReconciliationRevisionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_reconciliation_revisions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("reconciliation_id", reconciliationId)
    .order("revision_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listCashReconciliationStatusEvents(
  tenantId: string,
  reconciliationId: string,
): Promise<CashReconciliationStatusEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_reconciliation_status_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("reconciliation_id", reconciliationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listCashPoolReopenEvents(
  tenantId: string,
  poolId: string,
): Promise<CashPoolReopenEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pool_reopen_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// tenant_id is re-derived by the RPC from the pool row itself — never
// accepted here or forwarded from caller input.
export async function createCashReconciliationDraft(params: {
  poolId: string;
  actualCountedCash: number;
  explanation?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("create_cash_reconciliation_draft", {
    p_pool_id: params.poolId,
    p_actual_counted_cash: params.actualCountedCash,
    p_explanation: params.explanation,
  });
}

export async function reviseCashReconciliationDraft(params: {
  reconciliationId: string;
  actualCountedCash: number;
  explanation?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("revise_cash_reconciliation_draft", {
    p_reconciliation_id: params.reconciliationId,
    p_actual_counted_cash: params.actualCountedCash,
    p_explanation: params.explanation,
  });
}

export async function submitCashReconciliation(reconciliationId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("submit_cash_reconciliation", { p_reconciliation_id: reconciliationId });
}

// Owner-only server-side (the RPC re-checks). Locks the cash pool, closes it
// atomically once the server-recomputed financial_version still matches the
// one snapshotted at submit time.
export async function approveCashReconciliation(reconciliationId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("approve_cash_reconciliation", { p_reconciliation_id: reconciliationId });
}

export async function rejectCashReconciliation(reconciliationId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reject_cash_reconciliation", {
    p_reconciliation_id: reconciliationId,
    p_reason: reason,
  });
}

export async function requestCashReconciliationCorrection(reconciliationId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("request_cash_reconciliation_correction", {
    p_reconciliation_id: reconciliationId,
    p_reason: reason,
  });
}

// Owner-only. tenant/actor/timestamp are server-derived; only which pool and
// why are accepted here.
export async function reopenCashPool(poolId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reopen_cash_pool", { p_pool_id: poolId, p_reason: reason });
}

// Tenant-safe: any active tenant member can call this (the RPC re-checks
// membership against the pool's own tenant_id). Used to explain why EOD
// close is blocked by Gate 1G.1's unresolved-expense guard.
export async function getUnresolvedExpenseCount(poolId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("get_unresolved_expense_count", { p_pool_id: poolId });
}
