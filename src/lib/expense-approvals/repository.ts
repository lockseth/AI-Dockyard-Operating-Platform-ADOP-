import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ExpenseSubmissionRow = Tables<"expense_submissions">;
export type ExpenseSubmissionRevisionRow = Tables<"expense_submission_revisions">;
export type ExpenseSubmissionStatusEventRow = Tables<"expense_submission_status_events">;
export type ExpenseSubmissionCurrentRow = Tables<"expense_submission_current">;

export async function listExpenseSubmissionsCurrentForTenant(
  tenantId: string,
): Promise<ExpenseSubmissionCurrentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_submission_current")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listExpenseSubmissionRevisions(
  tenantId: string,
  submissionId: string,
): Promise<ExpenseSubmissionRevisionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_submission_revisions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("submission_id", submissionId)
    .order("revision_number", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listExpenseSubmissionStatusEvents(
  tenantId: string,
  submissionId: string,
): Promise<ExpenseSubmissionStatusEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_submission_status_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// tenant_id is caller-derived (like get_or_create_daily_cash_pool) — the RPC
// itself re-validates it against the caller's own active owner/admin
// membership, so a forged tenant_id is rejected, not merely ignored.
export async function createExpenseDraft(params: {
  tenantId: string;
  poolId: string;
  projectId: string;
  categoryId: string;
  amount: number;
  description: string;
  vendorId?: string;
  referenceNumber?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("create_expense_draft", {
    p_tenant_id: params.tenantId,
    p_pool_id: params.poolId,
    p_project_id: params.projectId,
    p_category_id: params.categoryId,
    p_amount: params.amount,
    p_description: params.description,
    p_vendor_id: params.vendorId,
    p_reference_number: params.referenceNumber,
  });
}

// tenant_id is re-derived by the RPC from the submission row itself — never
// accepted here or forwarded from caller input.
export async function reviseExpenseDraft(params: {
  submissionId: string;
  poolId: string;
  projectId: string;
  categoryId: string;
  amount: number;
  description: string;
  vendorId?: string;
  referenceNumber?: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("revise_expense_draft", {
    p_submission_id: params.submissionId,
    p_pool_id: params.poolId,
    p_project_id: params.projectId,
    p_category_id: params.categoryId,
    p_amount: params.amount,
    p_description: params.description,
    p_vendor_id: params.vendorId,
    p_reference_number: params.referenceNumber,
  });
}

export async function submitExpense(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("submit_expense", { p_submission_id: submissionId });
}

// Owner-only server-side (the RPC re-checks); posts exactly one ledger entry
// atomically. No amount/pool/project/category/vendor is accepted here — the
// RPC reads them from the submission's current revision.
export async function approveExpenseSubmission(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("approve_expense_submission", { p_submission_id: submissionId });
}

export async function rejectExpenseSubmission(submissionId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reject_expense_submission", { p_submission_id: submissionId, p_reason: reason });
}

export async function requestExpenseCorrection(submissionId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("request_expense_correction", { p_submission_id: submissionId, p_reason: reason });
}
