import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ExpenseDuplicateCandidateRow = Tables<"expense_duplicate_candidates">;
export type ExpenseDuplicateCandidateCurrentRow = Tables<"expense_duplicate_candidate_current">;
export type ExpenseDuplicateCandidateResolutionEventRow = Tables<"expense_duplicate_candidate_resolution_events">;

export async function listPendingExpenseDuplicateCandidatesForTenant(
  tenantId: string,
): Promise<ExpenseDuplicateCandidateCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_duplicate_candidate_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("detected_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// submissionId is validated as a UUID by the caller (idSchema) before this
// is invoked, so it is safe to interpolate into a PostgREST `.or()` filter —
// a UUID cannot contain the comma/parenthesis characters that are
// structural to that mini filter grammar.
export async function listExpenseDuplicateCandidatesForSubmission(
  tenantId: string,
  submissionId: string,
): Promise<ExpenseDuplicateCandidateCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_duplicate_candidate_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(`submission_id_1.eq.${submissionId},submission_id_2.eq.${submissionId}`)
    .order("detected_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listExpenseDuplicateCandidateResolutionEvents(
  tenantId: string,
  candidateId: string,
): Promise<ExpenseDuplicateCandidateResolutionEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_duplicate_candidate_resolution_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// tenant/actor/timestamp are all server-derived by the RPC from the
// candidate row and the caller's own JWT — never accepted here or forwarded
// from caller input.
export async function resolveExpenseDuplicateCandidate(params: {
  candidateId: string;
  resolution: "not_duplicate" | "confirmed_duplicate";
  reason: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("resolve_expense_duplicate_candidate", {
    p_candidate_id: params.candidateId,
    p_resolution: params.resolution,
    p_reason: params.reason,
  });
}
