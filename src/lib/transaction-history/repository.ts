import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TrustedTransactionRow } from "./types";

export interface ListTrustedTransactionsParams {
  tenantId: string;
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  transactionType?: string;
  transactionDirection?: string;
  source?: string;
  status?: string;
  importBatchId?: string;
  search?: string;
  cursorBusinessDate?: string;
  cursorCreatedAt?: string;
  cursorLogicalId?: string;
  limit: number;
}

export async function listTrustedTransactions(params: ListTrustedTransactionsParams): Promise<TrustedTransactionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_trusted_transactions", {
    p_tenant_id: params.tenantId,
    p_date_from: params.dateFrom,
    p_date_to: params.dateTo,
    p_project_id: params.projectId,
    p_transaction_type: params.transactionType,
    p_transaction_direction: params.transactionDirection,
    p_source: params.source,
    p_status: params.status,
    p_import_batch_id: params.importBatchId,
    p_search: params.search,
    p_cursor_business_date: params.cursorBusinessDate,
    p_cursor_created_at: params.cursorCreatedAt,
    p_cursor_logical_id: params.cursorLogicalId,
    p_limit: params.limit,
  });

  if (error) throw error;
  return data ?? [];
}

export interface SummarizeTrustedTransactionsParams {
  tenantId: string;
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  transactionType?: string;
  transactionDirection?: string;
  source?: string;
  status?: string;
  importBatchId?: string;
  search?: string;
}

export type TrustedTransactionSummary = {
  total_cash_in: number;
  total_cash_out: number;
  net_cash_effect: number;
  total_project_cost_increase: number;
  total_project_cost_reduction: number;
  net_project_cost_effect: number;
  total_shared_overhead: number;
  transaction_count: number;
};

export async function summarizeTrustedTransactions(
  params: SummarizeTrustedTransactionsParams,
): Promise<TrustedTransactionSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("summarize_trusted_transactions", {
    p_tenant_id: params.tenantId,
    p_date_from: params.dateFrom,
    p_date_to: params.dateTo,
    p_project_id: params.projectId,
    p_transaction_type: params.transactionType,
    p_transaction_direction: params.transactionDirection,
    p_source: params.source,
    p_status: params.status,
    p_import_batch_id: params.importBatchId,
    p_search: params.search,
  });

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getTrustedTransactionDetail(
  tenantId: string,
  logicalTransactionId: string,
): Promise<TrustedTransactionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_trusted_transaction_detail", {
    p_tenant_id: tenantId,
    p_logical_transaction_id: logicalTransactionId,
  });

  if (error) throw error;
  // The RPC returns a single composite row with every column null when no
  // match is found (SQL "select into" on zero rows) rather than no row at
  // all — logical_transaction_id null is the reliable NOT_FOUND signal.
  if (!data || data.logical_transaction_id === null) {
    return null;
  }
  return data;
}
