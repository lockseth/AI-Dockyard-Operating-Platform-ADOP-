import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type ExpenseCategoryRow = Tables<"expense_categories">;

export async function listExpenseCategories(tenantId: string, search?: string): Promise<ExpenseCategoryRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("expense_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getExpenseCategoryById(tenantId: string, id: string): Promise<ExpenseCategoryRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertExpenseCategory(row: TablesInsert<"expense_categories">) {
  const supabase = await createSupabaseServerClient();
  return supabase.from("expense_categories").insert(row).select("*").single();
}

export async function updateExpenseCategoryRow(
  tenantId: string,
  id: string,
  patch: TablesUpdate<"expense_categories">,
) {
  const supabase = await createSupabaseServerClient();
  return supabase
    .from("expense_categories")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .single();
}
