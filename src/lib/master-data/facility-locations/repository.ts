import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type FacilityLocationRow = Tables<"facility_locations">;

export async function listFacilityLocations(tenantId: string, search?: string): Promise<FacilityLocationRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("facility_locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getFacilityLocationById(tenantId: string, id: string): Promise<FacilityLocationRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("facility_locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertFacilityLocation(row: TablesInsert<"facility_locations">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("facility_locations").insert(row).select("*").single();
}

export async function updateFacilityLocationRow(
  tenantId: string,
  id: string,
  patch: TablesUpdate<"facility_locations">,
) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("facility_locations")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
