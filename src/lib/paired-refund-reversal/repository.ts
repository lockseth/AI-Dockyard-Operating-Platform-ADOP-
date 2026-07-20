import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReversePairedProjectRefundResult {
  cash_reversal_id: string;
  cost_reversal_id: string;
  result_status: string;
}

// Tenant/actor are re-derived server-side inside the RPC from the two
// locked original entries — never accepted here. Only which pair to
// reverse and why are caller-supplied.
export async function reversePairedProjectRefund(params: {
  cashEntryId: string;
  costEntryId: string;
  reason: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reverse_paired_project_refund", {
    p_cash_entry_id: params.cashEntryId,
    p_cost_entry_id: params.costEntryId,
    p_reason: params.reason,
  });
}
