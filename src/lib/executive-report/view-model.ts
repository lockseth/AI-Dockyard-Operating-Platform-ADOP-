import type { TenantRole } from "@/lib/auth/tenant";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import { buildActiveProjectCostRows, buildUnbilledVesselIndicator } from "@/lib/owner-control/view-model";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { ExecutiveAttentionBreakdown, ExecutiveAttentionItem, ExecutiveAttentionTag, ExecutiveReportSummary } from "./types";

function projectLabel(row: BillingWorkspaceRow): string {
  return row.projectCode ? `${row.vesselName} — ${row.projectCode}` : row.vesselName;
}

// Prefers the invoice detail page (where DeliverySection lives) whenever an
// active invoice exists — draft or issued — and falls back to the
// project's own Billing Workspace record when there is no invoice at all
// (the UNBILLED-only case).
function traceUrlFor(row: BillingWorkspaceRow): string {
  return row.activeInvoice ? `/billing/invoices/${row.activeInvoice.id}` : `/billing/workspace/${row.projectId}`;
}

// Mirrors DeliverySection's own `latest`/`isAcknowledged` reads verbatim
// (src/app/billing/invoices/[invoiceId]/DeliverySection.tsx) so this list's
// tags never diverge from what the invoice detail page itself would show —
// `latestEvent` must already be the event_seq-DESC most-recent row.
function deliveryTagsFor(latestEvent: InvoiceDeliveryEventRow | null): ExecutiveAttentionTag[] {
  const tags: ExecutiveAttentionTag[] = [];
  if (!latestEvent) {
    tags.push("NOT_DELIVERED");
  } else if (latestEvent.event_type === "failed") {
    tags.push("DELIVERY_FAILED");
  }

  const isAcknowledged = latestEvent?.event_type === "acknowledged";
  if (!isAcknowledged) {
    tags.push("NOT_ACKNOWLEDGED");
  }
  return tags;
}

// Pure — every input is already-loaded/composed rows (BillingWorkspaceRow
// from the Billing Workspace composition, plus one latest-delivery-event
// lookup per issued invoice). One item per Project Kapal, never per invoice
// event, so a project with multiple compatible tags (e.g. NOT_DELIVERED +
// NOT_ACKNOWLEDGED) still counts once.
export function buildExecutiveAttentionItems(params: {
  billingRows: BillingWorkspaceRow[];
  latestDeliveryEventByInvoiceId: Map<string, InvoiceDeliveryEventRow | null>;
}): ExecutiveAttentionItem[] {
  const { billingRows, latestDeliveryEventByInvoiceId } = params;
  const items: ExecutiveAttentionItem[] = [];

  for (const row of billingRows) {
    const tags: ExecutiveAttentionTag[] = [];

    if (row.isUnbilledAlert) {
      tags.push("UNBILLED");
    }

    // DRAFT_INCOMPLETE only applies to draft invoices and is never combined
    // with a delivery tag (delivery tags only evaluate issued invoices).
    if (row.activeInvoice?.status === "draft") {
      if (row.status === "DRAFT_INCOMPLETE") {
        tags.push("DRAFT_INCOMPLETE");
      }
    } else if (row.activeInvoice?.status === "issued" && row.activeInvoice.id) {
      const latest = latestDeliveryEventByInvoiceId.get(row.activeInvoice.id) ?? null;
      tags.push(...deliveryTagsFor(latest));
    }

    if (tags.length === 0) continue;

    items.push({
      projectId: row.projectId,
      label: projectLabel(row),
      tags,
      amount: row.activeInvoice?.total_amount ?? (row.isUnbilledAlert ? row.unbilledAmountTotal : null),
      traceUrl: traceUrlFor(row),
    });
  }

  return items;
}

// Non-exclusive per-tag counts — intentionally not summed into a total
// (see buildExecutiveReportSummary.attentionTotalCount for the deduplicated
// count).
export function buildExecutiveAttentionBreakdown(items: ExecutiveAttentionItem[]): ExecutiveAttentionBreakdown {
  return {
    unbilled: items.filter((item) => item.tags.includes("UNBILLED")).length,
    draftIncomplete: items.filter((item) => item.tags.includes("DRAFT_INCOMPLETE")).length,
    notDelivered: items.filter((item) => item.tags.includes("NOT_DELIVERED")).length,
    deliveryFailed: items.filter((item) => item.tags.includes("DELIVERY_FAILED")).length,
    notAcknowledged: items.filter((item) => item.tags.includes("NOT_ACKNOWLEDGED")).length,
  };
}

// Top-level composition — pure, no reads. costRunningTotal (from active
// Project Kapal cost rows) and issuedInvoices.valueTotal (from issued
// invoices' snapshot totals) are always kept as separate fields; they are
// never added together into one "nilai pekerjaan" figure.
export function buildExecutiveReportSummary(params: {
  roles: TenantRole[];
  projects: VesselProjectRow[];
  vessels: VesselRow[];
  costSummaries: VesselProjectCostSummaryRow[];
  billingRows: BillingWorkspaceRow[];
  latestDeliveryEventByInvoiceId: Map<string, InvoiceDeliveryEventRow | null>;
}): ExecutiveReportSummary {
  const { roles, projects, vessels, costSummaries, billingRows, latestDeliveryEventByInvoiceId } = params;

  const activeProjectCostRows = buildActiveProjectCostRows(projects, vessels, costSummaries);
  const costRunningTotal = activeProjectCostRows.reduce((sum, row) => sum + row.totalCost, 0);

  const unbilled = buildUnbilledVesselIndicator(roles, billingRows) ?? { count: 0, amountTotal: 0 };

  const issuedRows = billingRows.filter((row) => row.activeInvoice?.status === "issued");
  const issuedInvoices = {
    count: issuedRows.length,
    valueTotal: issuedRows.reduce((sum, row) => sum + (row.activeInvoice?.total_amount ?? 0), 0),
  };

  const attentionItems = buildExecutiveAttentionItems({ billingRows, latestDeliveryEventByInvoiceId });
  const attentionBreakdown = buildExecutiveAttentionBreakdown(attentionItems);

  return {
    activeProjectCount: activeProjectCostRows.length,
    costRunningTotal,
    unbilled,
    issuedInvoices,
    attentionItems,
    attentionTotalCount: attentionItems.length,
    attentionBreakdown,
  };
}
