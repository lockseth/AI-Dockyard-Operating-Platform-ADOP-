import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/types/database";
import type { VesselProjectLifecycleStatus, VesselProjectPriority } from "./types";

export type VesselProjectRow = Tables<"vessel_projects">;
export type VesselProjectCostSummaryRow = Tables<"vessel_project_cost_summary">;

// Server-computed total cost per project (net of reversals) — see
// vessel_project_cost_summary in 20260719120000_project_cost_ledger.sql.
export async function listVesselProjectCostSummary(tenantId: string): Promise<VesselProjectCostSummaryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessel_project_cost_summary")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  return data ?? [];
}

export async function listVesselProjects(tenantId: string): Promise<VesselProjectRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessel_projects")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getVesselProjectById(tenantId: string, id: string): Promise<VesselProjectRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessel_projects")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertVesselProject(row: TablesInsert<"vessel_projects">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("vessel_projects").insert(row).select("*").single();
}

// The only mutation path for lifecycle_status — the RPC itself re-derives
// tenant_id and re-checks owner/admin membership server-side (see the
// migration), so there is no tenant_id/actor argument to pass or forge here.
// facilityLocationId only matters for draft -> active ("Lengkapi &
// Aktifkan") — the RPC coalesces it onto the existing value for every other
// transition, so passing it always is harmless.
export async function transitionVesselProjectLifecycle(
  id: string,
  toStatus: VesselProjectLifecycleStatus,
  reason?: string,
  facilityLocationId?: string,
) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("transition_vessel_project_lifecycle", {
    p_project_id: id,
    p_to_status: toStatus,
    p_reason: reason,
    p_facility_location_id: facilityLocationId,
  });
}

// The only mutation path for priority after creation — vessel_projects has
// no general UPDATE grant for `authenticated` at all, matching every other
// field on this table (see 20260719100000's own comment).
export async function setVesselProjectPriority(id: string, priority: VesselProjectPriority) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("set_vessel_project_priority", {
    p_project_id: id,
    p_priority: priority,
  });
}
