import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json, Tables } from "@/types/database";
import type { CashImportBatchRpcRow } from "./types";

export type CashImportBatchRow = Tables<"cash_import_batches">;
export type CashImportRowRow = Tables<"cash_import_rows">;
export type CashImportEventRow = Tables<"cash_import_events">;
export type CashImportBatchCreationResult = Database["public"]["CompositeTypes"]["cash_import_batch_creation_result"];

// `supabase gen types` marks every SQL function parameter that has no
// DEFAULT as non-nullable, even though Postgres itself accepts NULL for any
// scalar parameter without an explicit `not null` constraint — a generator
// gap, not a real invariant. p_workbook_closing_balance and p_vessel_label
// are both genuinely nullable at the SQL level (an undetected closing
// balance, or a row the parser could not attach a label to) and must be
// allowed to carry null here.
function nullableRpcArg<T>(value: T | null): T {
  return value as T;
}

export async function listCashImportBatchesForTenant(tenantId: string): Promise<CashImportBatchRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_import_batches")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Read-only mirror of approve_and_commit_cash_import_batch's own
// OPENING_BALANCE_CONFLICT check (20260720120000 §6b) — lets the UI show a
// BLOCKED signal before the owner even attempts to approve, instead of only
// discovering the conflict from a failed commit. Does NOT call
// get_or_create_daily_cash_pool (that would create a pool as a side effect
// of merely viewing a preview) — if no pool exists yet for this date, there
// is nothing to conflict with.
export async function hasExistingFinancialEntriesForBusinessDate(
  tenantId: string,
  businessDate: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: pool, error: poolError } = await supabase
    .from("cash_pools")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (poolError) throw poolError;
  if (!pool) return false;

  const [{ count: entryCount, error: entryError }, { count: costCount, error: costError }] = await Promise.all([
    supabase
      .from("cash_pool_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id),
    supabase
      .from("project_cost_ledger_entries")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", pool.id),
  ]);

  if (entryError) throw entryError;
  if (costError) throw costError;

  return (entryCount ?? 0) > 0 || (costCount ?? 0) > 0;
}

export async function getCashImportBatch(tenantId: string, batchId: string): Promise<CashImportBatchRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_import_batches")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", batchId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listCashImportRowsForBatch(tenantId: string, batchId: string): Promise<CashImportRowRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_import_rows")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId)
    .order("source_row_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listCashImportEventsForBatch(tenantId: string, batchId: string): Promise<CashImportEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_import_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface CreateCashImportBatchParams {
  tenantId: string;
  sourceFilename: string;
  sourceSha256: string;
  sourceSheetName: string;
  businessDate: string;
  openingBalance: number;
  workbookClosingBalance: number | null;
  rows: CashImportBatchRpcRow[];
}

// tenant/actor are re-checked server-side inside the RPC itself (see the
// migration file) — this call forwards the already-validated, server-parsed
// analysis only. No FormData field, hidden or otherwise, ever reaches this
// function directly; the caller (service.ts) re-derives every argument
// from requireTenantContext() and the parser's own output.
export async function createCashImportBatch(params: CreateCashImportBatchParams) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("create_cash_import_batch", {
    p_tenant_id: params.tenantId,
    p_source_filename: params.sourceFilename,
    p_source_sha256: params.sourceSha256,
    p_source_sheet_name: params.sourceSheetName,
    p_business_date: params.businessDate,
    p_opening_balance: params.openingBalance,
    p_workbook_closing_balance: nullableRpcArg(params.workbookClosingBalance),
    p_rows: params.rows as unknown as Json,
  });
}

export async function setCashImportLabelMapping(params: {
  batchId: string;
  vesselLabel: string | null;
  mappingKind: Database["public"]["Enums"]["cash_import_mapping_kind"];
  mappedVesselProjectId: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("set_cash_import_label_mapping", {
    p_batch_id: params.batchId,
    p_vessel_label: nullableRpcArg(params.vesselLabel),
    p_mapping_kind: params.mappingKind,
    p_mapped_vessel_project_id: params.mappedVesselProjectId ?? undefined,
  });
}

export async function setCashImportRowDisposition(params: {
  rowId: string;
  disposition: Database["public"]["Enums"]["cash_import_row_disposition"];
  reason: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("set_cash_import_row_disposition", {
    p_row_id: params.rowId,
    p_disposition: params.disposition,
    p_disposition_reason: params.reason ?? undefined,
  });
}

export async function markCashImportBatchReadyForReview(batchId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("mark_cash_import_batch_ready_for_review", { p_batch_id: batchId });
}

// Owner-only atomic canonical commit — tenant/actor are re-derived server-
// side inside the RPC from the batch row itself, never accepted here.
export async function approveAndCommitCashImportBatch(batchId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("approve_and_commit_cash_import_batch", { p_batch_id: batchId });
}

export async function rejectCashImportBatch(batchId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reject_cash_import_batch", { p_batch_id: batchId, p_reason: reason });
}

// Owner-only, single-transaction append-only rollback of a committed batch —
// tenant/actor/pool are all re-derived server-side inside the RPC from the
// batch row itself, never accepted here. Only which batch to roll back and
// why are caller-supplied.
export async function rollbackCashImportBatch(batchId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("rollback_cash_import_batch", { p_batch_id: batchId, p_reason: reason });
}
