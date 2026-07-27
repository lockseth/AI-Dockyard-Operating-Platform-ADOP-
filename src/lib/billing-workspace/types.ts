import type { InvoiceBillingCompletenessStatus, InvoiceBillingSummaryRow } from "@/lib/invoice-evidence/types";
import type { VesselProjectLifecycleStatus } from "@/lib/vessel-projects/types";

// Project-level billing status shown on the Workspace list/KPI. Extends the
// invoice-level `invoice_billing_completeness_status` enum (Phase 2A
// Contract §11) with two project-level states the contract itself already
// names: `NOT_CLOSED` (project not yet eligible — informational only, no
// invoice is expected) and `NO_INVOICE` (Contract §11 table row 1 — project
// closed, no active Billing Record at all). A project whose only
// invoice(s) are `void` also resolves to `NO_INVOICE`, matching Contract
// §13.1 condition #3 (void without a non-void successor is unbilled again).
export type BillingWorkspaceStatus = "NOT_CLOSED" | "NO_INVOICE" | InvoiceBillingCompletenessStatus;

export interface BillingWorkspaceRow {
  projectId: string;
  vesselName: string;
  projectCode: string | null;
  clientId: string;
  clientName: string;
  lifecycleStatus: VesselProjectLifecycleStatus;
  closedAt: string | null;
  status: BillingWorkspaceStatus;
  // The single active (draft/issued) Billing Record for this project, if
  // any — Contract §5 guarantees at most one, since bind_invoice_transaction
  // rejects a project already fully covered by another active invoice.
  activeInvoice: InvoiceBillingSummaryRow | null;
  // Sourced directly from `list_unbilled_vessel_projects` (Contract §13.3)
  // — never recomputed here — so the alert flag always matches the read
  // model a gate-implementation change to eligibility rules would update.
  isUnbilledAlert: boolean;
  unbilledTransactionCount: number;
  unbilledAmountTotal: number;
  lastVoidedInvoiceId: string | null;
  lastVoidReason: string | null;
}
