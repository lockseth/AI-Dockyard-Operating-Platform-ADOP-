import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type ClientRow = Tables<"clients">;

export async function listClients(tenantId: string, search?: string): Promise<ClientRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("clients")
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

export async function getClientById(tenantId: string, id: string): Promise<ClientRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertClient(row: TablesInsert<"clients">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("clients").insert(row).select("*").single();
}

export async function updateClientRow(tenantId: string, id: string, patch: TablesUpdate<"clients">) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("clients")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
