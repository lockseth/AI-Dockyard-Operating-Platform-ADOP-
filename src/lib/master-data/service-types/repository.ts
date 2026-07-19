import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type ServiceTypeRow = Tables<"service_types">;

export async function listServiceTypes(tenantId: string, search?: string): Promise<ServiceTypeRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("service_types")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getServiceTypeById(tenantId: string, id: string): Promise<ServiceTypeRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_types")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertServiceType(row: TablesInsert<"service_types">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("service_types").insert(row).select("*").single();
}

export async function updateServiceTypeRow(tenantId: string, id: string, patch: TablesUpdate<"service_types">) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("service_types")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
