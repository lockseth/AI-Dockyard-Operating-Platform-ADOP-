import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type ClientContactRow = Tables<"client_contacts">;

export async function listContactsByClient(tenantId: string, clientId: string): Promise<ClientContactRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getContactById(tenantId: string, id: string): Promise<ClientContactRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertContact(row: TablesInsert<"client_contacts">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("client_contacts").insert(row).select("*").single();
}

export async function updateContactRow(tenantId: string, id: string, patch: TablesUpdate<"client_contacts">) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("client_contacts")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
