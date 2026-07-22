import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type SharedOverheadAllocationRow = Tables<"shared_overhead_allocations">;
export type SharedOverheadAllocationCurrentRow = Tables<"shared_overhead_allocations_current">;
export type SharedOverheadAllocationStatusRow = Tables<"shared_overhead_allocation_status">;

export async function listSharedOverheadAllocationStatusForTenant(
  tenantId: string,
): Promise<SharedOverheadAllocationStatusRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shared_overhead_allocation_status")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("business_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listSharedOverheadAllocationsForTenant(
  tenantId: string,
): Promise<SharedOverheadAllocationCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shared_overhead_allocations_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listSharedOverheadAllocationsForEntry(
  tenantId: string,
  overheadEntryId: string,
): Promise<SharedOverheadAllocationCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shared_overhead_allocations_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("overhead_entry_id", overheadEntryId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listSharedOverheadAllocationsForProject(
  tenantId: string,
  projectId: string,
): Promise<SharedOverheadAllocationCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("shared_overhead_allocations_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// tenant/actor/timestamp are all server-derived by the RPC from the
// overhead entry/project rows and the caller's own JWT — never accepted
// here or forwarded from caller input.
export async function allocateSharedOverheadEntry(params: {
  overheadEntryId: string;
  projectId: string;
  amount: number;
  note?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("allocate_shared_overhead_entry", {
    p_overhead_entry_id: params.overheadEntryId,
    p_project_id: params.projectId,
    p_amount: params.amount,
    p_note: params.note,
  });
}

export async function reverseSharedOverheadAllocation(params: { allocationId: string; reason: string }) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reverse_shared_overhead_allocation", {
    p_allocation_id: params.allocationId,
    p_reason: params.reason,
  });
}
