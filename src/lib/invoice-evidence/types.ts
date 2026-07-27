import type { Enums, Tables } from "@/types/database";

export type InvoiceRow = Tables<"invoices">;
export type InvoiceBillingSummaryRow = Tables<"invoice_billing_summary">;
export type InvoiceTransactionLineRow = Tables<"invoice_transaction_lines">;
export type InvoiceEvidenceRow = Tables<"invoice_evidence">;
export type InvoiceEvidenceVersionRow = Tables<"invoice_evidence_versions">;
export type InvoiceEligibleTransactionRow = Tables<"invoice_eligible_transactions">;
export type TransactionInvoiceBindingRow = Tables<"transaction_invoice_bindings">;
export type UnbilledVesselProjectRow = Tables<"unbilled_vessel_projects">;

export type InvoiceStatus = Enums<"invoice_status">;
export type InvoiceEvidenceVersionStatus = Enums<"invoice_evidence_version_status">;
// Phase 2A — ADOP_PHASE_2A_BILLING_METADATA_UNBILLED_CONTROL_CONTRACT_v1.0.md
export type InvoiceOrigin = Enums<"invoice_origin">;
export type InvoiceLegacyCoverageStatus = Enums<"invoice_legacy_coverage_status">;
export type InvoiceBillingCompletenessStatus = Enums<"invoice_billing_completeness_status">;

// Mirrors the bucket-level and finalize_invoice_evidence_version RPC
// constraints in 20260723000000_invoice_evidence_documents.sql — kept here
// as the single TS-side source of truth for client-side pre-validation
// (UX-only; the database is the real enforcement boundary).
export const EVIDENCE_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type EvidenceMimeType = (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number];
export const EVIDENCE_MAX_SIZE_BYTES = 52_428_800;

// Short-lived, single-purpose — Gate 4A Contract §5/F14. Re-minted on every
// "Buka Dokumen" click, never cached or persisted.
export const EVIDENCE_SIGNED_URL_TTL_SECONDS = 60;
