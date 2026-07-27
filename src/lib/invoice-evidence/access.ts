import type { TenantRole } from "@/lib/auth/tenant";

// Gate 4A Contract §7 — invoice/evidence reads AND every mutation follow the
// trusted_transaction_history precedent (owner+admin only), narrower than
// the reviewer/viewer-readable master-data pattern. A single role set
// covers both "can view" and "can act" here because Gate 4A explicitly
// froze no maker-checker separation for v1 (§7, §11 decision 4).
const INVOICE_EVIDENCE_ROLES: TenantRole[] = ["owner", "admin"];

export function canAccessInvoiceEvidence(roles: TenantRole[]): boolean {
  return roles.some((role) => INVOICE_EVIDENCE_ROLES.includes(role));
}
