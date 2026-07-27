// Same read/write gate as Invoice & Evidence (Gate 4A Contract §7,
// owner/admin only) — the Billing Workspace is a read-model view over the
// same invoices/vessel_projects rows, so it reuses the single source of
// truth for who may see billing data instead of declaring its own role list.
export { canAccessInvoiceEvidence as canAccessBillingWorkspace } from "@/lib/invoice-evidence/access";
