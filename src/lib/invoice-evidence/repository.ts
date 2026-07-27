import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  InvoiceBillingSummaryRow,
  InvoiceEligibleTransactionRow,
  InvoiceEvidenceVersionRow,
  InvoiceLegacyCoverageStatus,
  InvoiceRow,
  InvoiceStatus,
  InvoiceTransactionLineRow,
  TransactionInvoiceBindingRow,
  UnbilledVesselProjectRow,
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
// posture (see cost-ledger/repository.ts). project_id is mandatory (Phase
// 2A Contract §5.1) — the RPC rejects a null project_id itself, this is not
// re-validated here.
export async function createDraftInvoice(tenantId: string, projectId: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("create_draft_invoice", { p_tenant_id: tenantId, p_project_id: projectId });
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

// projectId is optional — the RPC derives it from the predecessor invoice
// when the predecessor already has one (every invoice created after Phase
// 2A does); only a predecessor with no project_id (pre-Phase 2A) requires
// it explicitly (Contract §5.1/VR-04).
export async function reissueInvoice(predecessorInvoiceId: string, projectId?: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("reissue_invoice", {
    p_predecessor_invoice_id: predecessorInvoiceId,
    p_project_id: projectId,
  });
}

// Phase 2A — ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md
// §7 manual invoice number registration, separate from other metadata edits
// (own audit action `invoice.number_registered`).
export async function registerInvoiceNumber(invoiceId: string, invoiceNumber: string) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("register_invoice_number", { p_invoice_id: invoiceId, p_invoice_number: invoiceNumber });
}

// §6.1/§10.1 — legal_entity_id/invoice_date/due_date only; project_id/
// client_id are locked at creation and never accepted here.
export async function updateInvoiceBillingMetadata(params: {
  invoiceId: string;
  legalEntityId: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  // The RPC's SQL parameters accept null at runtime (no NOT NULL on the
  // underlying columns) to let a field be explicitly cleared while draft —
  // the generated Args type does not model that nullability, hence the cast.
  return supabase.rpc("update_invoice_billing_metadata", {
    p_invoice_id: params.invoiceId,
    p_legal_entity_id: params.legalEntityId as unknown as string,
    p_invoice_date: params.invoiceDate as unknown as string,
    p_due_date: params.dueDate as unknown as string,
  });
}

// §15 — retroactive registration of an invoice issued/voided physically
// before it existed in ADOP. Never creates fabricated coverage: pass
// transactionEntryIds only for transactions that can actually be mapped
// (§15.7).
export async function registerLegacyInvoice(params: {
  tenantId: string;
  legalEntityId: string;
  projectId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: Extract<InvoiceStatus, "issued" | "void">;
  legacyCoverageStatus?: InvoiceLegacyCoverageStatus;
  voidReason?: string | null;
  transactionEntryIds?: string[] | null;
}) {
  const supabase = await createSupabaseServerClient();
  // p_due_date/p_void_reason/p_transaction_entry_ids accept null/omitted at
  // runtime (§15.2/§15.4 — unknown due_date, only-if-void reason, coverage
  // mapping optional); the generated Args type does not model that, hence
  // the casts.
  return supabase.rpc("register_legacy_invoice", {
    p_tenant_id: params.tenantId,
    p_legal_entity_id: params.legalEntityId,
    p_project_id: params.projectId,
    p_invoice_number: params.invoiceNumber,
    p_invoice_date: params.invoiceDate,
    p_due_date: params.dueDate as unknown as string,
    p_status: params.status,
    p_legacy_coverage_status: params.legacyCoverageStatus ?? "unknown",
    p_void_reason: (params.voidReason ?? null) as unknown as string,
    p_transaction_entry_ids: (params.transactionEntryIds ?? null) as unknown as string[],
  });
}

// §13 — Unbilled Vessel Alert, owner/admin only, tenant-isolated.
export async function listUnbilledVesselProjects(tenantId: string): Promise<UnbilledVesselProjectRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_unbilled_vessel_projects", { p_tenant_id: tenantId });

  if (error) throw error;
  return data ?? [];
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
