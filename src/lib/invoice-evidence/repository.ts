import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  InvoiceBillingSummaryRow,
  InvoiceEligibleTransactionRow,
  InvoiceEvidenceVersionRow,
  InvoiceRow,
  InvoiceStatus,
  InvoiceTransactionLineRow,
  TransactionInvoiceBindingRow,
} from "./types";

const EVIDENCE_BUCKET = "invoice-evidence";

export async function listInvoices(tenantId: string, status?: InvoiceStatus): Promise<InvoiceBillingSummaryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_invoices", {
    p_tenant_id: tenantId,
    p_status: status,
  });

  if (error) throw error;
  return data ?? [];
}

// Existence is not hidden from a wrong-tenant caller any more than
// issue_invoice/void_invoice already do (both raise a distinct "not
// authorized" message after finding the row) — get_invoice_summary mirrors
// that same existing Gate 4B posture; error is returned, never thrown, so
// the service layer can map it to a generic "not found" for the UI.
export async function getInvoiceSummary(invoiceId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("get_invoice_summary", { p_invoice_id: invoiceId });
}

export async function listInvoiceTransactionLines(tenantId: string, invoiceId: string): Promise<InvoiceTransactionLineRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_transaction_lines")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listInvoiceEvidenceVersions(tenantId: string, invoiceId: string): Promise<InvoiceEvidenceVersionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data: evidence, error: evidenceError } = await supabase
    .from("invoice_evidence")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (evidenceError) throw evidenceError;
  if (!evidence) return [];

  const { data, error } = await supabase
    .from("invoice_evidence_versions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("evidence_id", evidence.id)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Used by the finalize-evidence service to compare a freshly-computed
// client-side sha256 against the CURRENT version before uploading a
// duplicate — the retry-safety check for E-10, kept here rather than in
// Gate 4B's migration since it is a UX/idempotency concern, not a core
// invariant (version immutability/numbering stays entirely DB-enforced).
export async function getCurrentInvoiceEvidenceVersion(tenantId: string, invoiceId: string): Promise<InvoiceEvidenceVersionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data: evidence, error: evidenceError } = await supabase
    .from("invoice_evidence")
    .select("current_version_id")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (evidenceError) throw evidenceError;
  if (!evidence?.current_version_id) return null;

  const { data, error } = await supabase
    .from("invoice_evidence_versions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", evidence.current_version_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getInvoiceEvidenceVersionById(tenantId: string, versionId: string): Promise<InvoiceEvidenceVersionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_evidence_versions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", versionId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listInvoiceEligibleTransactions(
  tenantId: string,
  projectId?: string,
): Promise<InvoiceEligibleTransactionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_invoice_eligible_transactions", {
    p_tenant_id: tenantId,
    p_project_id: projectId,
  });

  if (error) throw error;
  return data ?? [];
}

export async function listTransactionInvoiceBindings(
  tenantId: string,
  transactionEntryId: string,
): Promise<TransactionInvoiceBindingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_transaction_invoice_bindings", {
    p_tenant_id: tenantId,
    p_transaction_entry_id: transactionEntryId,
  });

  if (error) throw error;
  return data ?? [];
}

// tenant_id is re-derived by the RPC from the caller's own membership, never
// accepted here from a form field — matches record_project_expense's
// posture (see cost-ledger/repository.ts).
export async function createDraftInvoice(tenantId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("create_draft_invoice", { p_tenant_id: tenantId });
}

export async function bindInvoiceTransaction(invoiceId: string, transactionEntryId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("bind_invoice_transaction", {
    p_invoice_id: invoiceId,
    p_transaction_entry_id: transactionEntryId,
  });
}

export async function unbindInvoiceTransaction(lineId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("unbind_invoice_transaction", { p_line_id: lineId });
}

export async function issueInvoice(invoiceId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("issue_invoice", { p_invoice_id: invoiceId });
}

export async function voidInvoice(invoiceId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("void_invoice", { p_invoice_id: invoiceId, p_reason: reason });
}

export async function reissueInvoice(predecessorInvoiceId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reissue_invoice", { p_predecessor_invoice_id: predecessorInvoiceId });
}

export async function finalizeInvoiceEvidenceVersion(params: {
  invoiceId: string;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("finalize_invoice_evidence_version", {
    p_invoice_id: params.invoiceId,
    p_storage_path: params.storagePath,
    p_sha256: params.sha256,
    p_size_bytes: params.sizeBytes,
    p_mime_type: params.mimeType,
  });
}

export async function verifyInvoiceEvidenceVersion(versionId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("verify_invoice_evidence_version", { p_version_id: versionId });
}

export async function rejectInvoiceEvidenceVersion(versionId: string, reason: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reject_invoice_evidence_version", { p_version_id: versionId, p_reason: reason });
}

// Server-authorized signed-URL path (Gate 4A Contract §5/F9/F14): the RPC
// independently re-verifies tenant+role and records `evidence.accessed`
// before this ever asks Storage for a URL, and returns the version's real
// storage_path rather than trusting one supplied by the caller.
export async function createInvoiceEvidenceSignedUrl(versionId: string, ttlSeconds: number) {
  const supabase = await createSupabaseServerClient();
  const { data: version, error: accessError } = await supabase.rpc("record_invoice_evidence_access", {
    p_version_id: versionId,
  });
  if (accessError || !version) {
    return { data: null, error: accessError };
  }

  return supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(version.storage_path, ttlSeconds);
}

export type { InvoiceRow };
