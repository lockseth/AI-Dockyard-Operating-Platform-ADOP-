// Same owner/admin gate as Billing Workspace / Invoice & Evidence (Gate 4A
// Contract §7) — the executive report is a read-only composition over that
// same billing data, so it reuses the single source of truth for who may
// see it instead of declaring its own role list.
export { canAccessInvoiceEvidence as canAccessExecutiveReport } from "@/lib/invoice-evidence/access";
