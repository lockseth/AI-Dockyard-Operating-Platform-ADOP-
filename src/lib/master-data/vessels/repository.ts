import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type VesselRow = Tables<"vessels">;

export async function listVesselsByClient(tenantId: string, clientId: string): Promise<VesselRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessels")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("vessel_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listVessels(tenantId: string, search?: string): Promise<VesselRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("vessels")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("vessel_name", { ascending: true });

  if (search) {
    query = query.ilike("vessel_name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getVesselById(tenantId: string, id: string): Promise<VesselRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vessels")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertVessel(row: TablesInsert<"vessels">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("vessels").insert(row).select("*").single();
}

export async function updateVesselRow(tenantId: string, id: string, patch: TablesUpdate<"vessels">) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("vessels")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
