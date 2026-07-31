import "server-only";
import { buildBillingWorkspaceRows } from "@/lib/billing-workspace/view-model";
import type { ExecutiveReportSummary } from "@/lib/executive-report/types";
import { buildExecutiveReportSummary } from "@/lib/executive-report/view-model";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import { getMorningBriefSourceRows } from "./repository";

// Reduces a tenant's full invoice_delivery_events history down to "the
// latest event per invoice_id" — event_seq is a strictly increasing
// per-invoice sequence (see 20260727000000_invoice_delivery_acknowledgment.sql),
// so the highest event_seq per invoice_id is always the latest event.
// Mirrors getLatestInvoiceDeliveryEventForActiveTenant's per-invoice "order
// by event_seq desc limit 1" read, just computed once over every event
// instead of one round trip per issued invoice.
function latestDeliveryEventByInvoiceId(events: InvoiceDeliveryEventRow[]): Map<string, InvoiceDeliveryEventRow> {
  const latest = new Map<string, InvoiceDeliveryEventRow>();
  for (const event of events) {
    const current = latest.get(event.invoice_id);
    if (!current || event.event_seq > current.event_seq) {
      latest.set(event.invoice_id, event);
    }
  }
  return latest;
}

// The canonical composition, reused verbatim: buildExecutiveReportSummary
// and buildBillingWorkspaceRows are the exact same pure functions
// getExecutiveReportForActiveTenant() and listBillingWorkspaceForActiveTenant()
// call — only the data-fetch beneath them differs (service-role, explicit
// tenantId, no session). "owner" is passed as the role because Morning
// Brief IS owner-facing content by definition — the parameter only gates
// buildUnbilledVesselIndicator's own owner/admin visibility rule inside the
// pure function, it never bypasses RLS or a real authorization check (this
// module already only runs after the internal route's INTERNAL_API_SECRET
// gate and pilot-tenant resolution).
export async function getExecutiveReportSummaryForTenant(tenantId: string): Promise<ExecutiveReportSummary> {
  const rows = await getMorningBriefSourceRows(tenantId);

  const billingRows = buildBillingWorkspaceRows({
    projects: rows.projects,
    vessels: rows.vessels,
    clients: rows.clients,
    invoices: rows.invoices,
    unbilled: rows.unbilled,
  });

  return buildExecutiveReportSummary({
    roles: ["owner"],
    projects: rows.projects,
    vessels: rows.vessels,
    costSummaries: rows.costSummaries,
    billingRows,
    latestDeliveryEventByInvoiceId: latestDeliveryEventByInvoiceId(rows.deliveryEvents),
  });
}
