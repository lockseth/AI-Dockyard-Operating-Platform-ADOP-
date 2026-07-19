import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type VendorRow = Tables<"vendors">;

export async function listVendors(tenantId: string, search?: string): Promise<VendorRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("vendors")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true });

  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getVendorById(tenantId: string, id: string): Promise<VendorRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertVendor(row: TablesInsert<"vendors">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("vendors").insert(row).select("*").single();
}

export async function updateVendorRow(tenantId: string, id: string, patch: TablesUpdate<"vendors">) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("vendors")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
