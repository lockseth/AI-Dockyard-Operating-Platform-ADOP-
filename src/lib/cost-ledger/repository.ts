import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ProjectCostLedgerEntryRow = Tables<"project_cost_ledger_entries">;
export type VesselProjectCostSummaryRow = Tables<"vessel_project_cost_summary">;

export async function listProjectCostLedgerEntries(
  tenantId: string,
  projectId: string,
): Promise<ProjectCostLedgerEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_cost_ledger_entries")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getVesselProjectCostSummary(
  tenantId: string,
  projectId: string,
): Promise<VesselProjectCostSummaryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessel_project_cost_summary")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// tenant_id is re-derived by the RPC from the pool row itself — never
// accepted here or forwarded from caller input.
export async function recordProjectExpense(params: {
  poolId: string;
  projectId: string;
  categoryId: string;
  amount: number;
  description: string;
  vendorId?: string;
  referenceNumber?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("record_project_expense", {
    p_pool_id: params.poolId,
    p_project_id: params.projectId,
    p_category_id: params.categoryId,
    p_amount: params.amount,
    p_description: params.description,
    p_vendor_id: params.vendorId,
    p_reference_number: params.referenceNumber,
  });
}

// tenant_id/pool_id/project_id/category_id/vendor_id/amount are all
// re-derived by the RPC from the original entry row — only which entry to
// reverse and why are accepted.
export async function reverseProjectExpense(entryId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reverse_project_expense", {
    p_entry_id: entryId,
    p_reason: reason,
  });
}
