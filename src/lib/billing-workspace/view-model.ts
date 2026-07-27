import type { InvoiceBillingSummaryRow, UnbilledVesselProjectRow } from "@/lib/invoice-evidence/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { BillingWorkspaceRow, BillingWorkspaceStatus } from "./types";

// Pure — every input is already-loaded rows (same *ForActiveTenant reads the
// Invoice & Evidence and Project Kapal pages already perform), nothing here
// queries or mutates. No new completeness rule is invented: the per-invoice
// status is read verbatim from `invoice_billing_summary.billing_completeness_status`
// (Contract §11, computed by the database), and unbilled membership is read
// verbatim from `unbilled_vessel_projects` (Contract §13) — this function
// only joins those already-computed facts onto one row per Project Kapal.
export function buildBillingWorkspaceRows(params: {
  projects: VesselProjectRow[];
  vessels: VesselRow[];
  clients: ClientRow[];
  invoices: InvoiceBillingSummaryRow[];
  unbilled: UnbilledVesselProjectRow[];
}): BillingWorkspaceRow[] {
  const { projects, vessels, clients, invoices, unbilled } = params;

  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));
  const clientNameById = new Map(clients.map((client) => [client.id, client.display_name]));
  const unbilledByProjectId = new Map(unbilled.map((row) => [row.project_id, row]));

  const invoicesByProjectId = new Map<string, InvoiceBillingSummaryRow[]>();
  for (const invoice of invoices) {
    if (!invoice.project_id) continue;
    const list = invoicesByProjectId.get(invoice.project_id) ?? [];
    list.push(invoice);
    invoicesByProjectId.set(invoice.project_id, list);
  }

  return projects.map((project) => {
    const projectInvoices = invoicesByProjectId.get(project.id) ?? [];
    // At most one active (draft/issued) invoice per project is possible
    // (Contract §5/§9.1) — sorted defensively so the most recently created
    // one wins if this invariant were ever violated upstream.
    const activeInvoice =
      projectInvoices
        .filter((invoice) => invoice.status === "draft" || invoice.status === "issued")
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;

    const unbilledRow = unbilledByProjectId.get(project.id) ?? null;

    let status: BillingWorkspaceStatus;
    if (project.lifecycle_status !== "closed") {
      status = "NOT_CLOSED";
    } else if (activeInvoice) {
      status = activeInvoice.billing_completeness_status ?? "DRAFT_INCOMPLETE";
    } else {
      status = "NO_INVOICE";
    }

    return {
      projectId: project.id,
      vesselName: vesselNameById.get(project.vessel_id) ?? "Kapal tidak dikenal",
      projectCode: project.project_code,
      clientId: project.client_id,
      clientName: clientNameById.get(project.client_id) ?? "Client tidak dikenal",
      lifecycleStatus: project.lifecycle_status,
      closedAt: project.closed_at,
      status,
      activeInvoice,
      isUnbilledAlert: unbilledRow !== null,
      unbilledTransactionCount: unbilledRow?.unbilled_transaction_count ?? 0,
      unbilledAmountTotal: unbilledRow?.unbilled_amount_total ?? 0,
      lastVoidedInvoiceId: unbilledRow?.last_voided_invoice_id ?? null,
      lastVoidReason: unbilledRow?.last_void_reason ?? null,
    };
  });
}

export interface BillingWorkspaceKpis {
  unbilledCount: number;
  incompleteCount: number;
  readyCount: number;
  hasInvoiceCount: number;
}

// Four KPI tiles per the workspace spec — not mutually exclusive by design
// (a DRAFT_INCOMPLETE row counts toward both "belum lengkap" and "sudah
// memiliki invoice"; that overlap is informative, not a bug).
export function computeBillingWorkspaceKpis(rows: BillingWorkspaceRow[]): BillingWorkspaceKpis {
  return {
    unbilledCount: rows.filter((row) => row.isUnbilledAlert).length,
    incompleteCount: rows.filter((row) => row.status === "DRAFT_INCOMPLETE").length,
    readyCount: rows.filter((row) => row.status === "DRAFT_READY_TO_ISSUE" || row.status === "READY_TO_SEND").length,
    hasInvoiceCount: rows.filter((row) => row.activeInvoice !== null).length,
  };
}

export function filterBillingWorkspaceRows(
  rows: BillingWorkspaceRow[],
  filters: { search?: string; status?: string },
): BillingWorkspaceRow[] {
  const search = filters.search?.trim().toLowerCase();
  const status = filters.status;

  return rows.filter((row) => {
    if (status && row.status !== status) return false;
    if (search) {
      const haystack = `${row.vesselName} ${row.projectCode ?? ""} ${row.clientName}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
