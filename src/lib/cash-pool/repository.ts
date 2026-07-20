import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { CashPoolEntryType } from "./types";

export type CashPoolRow = Tables<"cash_pools">;
export type CashPoolEntryRow = Tables<"cash_pool_entries">;
export type CashPoolDailySummaryRow = Tables<"cash_pool_daily_summary">;

// The only mutation path for a pool header — the RPC itself re-checks
// owner/admin membership on p_tenant_id server-side and is race-safe/
// idempotent (INSERT ... ON CONFLICT DO NOTHING), so a duplicate call for
// the same tenant/day always returns the one existing row.
export async function getOrCreateDailyCashPool(tenantId: string, businessDate: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("get_or_create_daily_cash_pool", {
    p_tenant_id: tenantId,
    p_business_date: businessDate,
  });
}

export async function getDailyCashPool(tenantId: string, businessDate: string): Promise<CashPoolRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pools")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getDailyCashPoolSummary(
  tenantId: string,
  businessDate: string,
): Promise<CashPoolDailySummaryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pool_daily_summary")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Tenant-wide, all business dates — used by Owner Control to resolve each
// pool's business_date for review queues that are not limited to today's
// pool (expense review, duplicate review, EOD reconciliation review).
export async function listCashPools(tenantId: string): Promise<CashPoolRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pools")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("business_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listCashPoolEntries(tenantId: string, poolId: string): Promise<CashPoolEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_pool_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// tenant_id is re-derived by the RPC from the pool row itself — never
// accepted here or forwarded from caller input.
export async function recordCashPoolEntry(
  poolId: string,
  entryType: CashPoolEntryType,
  amount: number,
  description?: string,
) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("record_cash_pool_entry", {
    p_pool_id: poolId,
    p_entry_type: entryType,
    p_amount: amount,
    p_description: description,
  });
}

// tenant_id/entry_type/amount are all re-derived by the RPC from the
// original entry row — only which entry to reverse and why are accepted.
export async function reverseCashPoolEntry(entryId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reverse_cash_pool_entry", {
    p_entry_id: entryId,
    p_reason: reason,
  });
}
