import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { listBillingWorkspaceForActiveTenant } from "@/lib/billing-workspace/service";
import { getLatestInvoiceDeliveryEventForActiveTenant } from "@/lib/invoice-delivery/service";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listVesselProjectCostSummaryForActiveTenant, listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import type { ExecutiveReportSummary } from "./types";
import { buildExecutiveReportSummary } from "./view-model";

// Owner-first read composition — every read below is one of the existing
// *ForActiveTenant functions Billing Workspace / Owner Control / Project
// Kapal already call; this module adds no new RPC, schema, or source of
// truth (Gate 5C). Per-invoice delivery lookups are permitted for the pilot
// scale (no new aggregate RPC/view is built preventively) but each one is
// the lean single-row read (getLatestInvoiceDeliveryEventForActiveTenant),
// never the full event-history read the invoice detail page uses.
export async function getExecutiveReportForActiveTenant(): Promise<ExecutiveReportSummary> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const [projects, vessels, costSummaries, billingRows] = await Promise.all([
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listVesselProjectCostSummaryForActiveTenant(),
    listBillingWorkspaceForActiveTenant(),
  ]);

  const issuedInvoiceIds = billingRows
    .filter((row) => row.activeInvoice?.status === "issued")
    .map((row) => row.activeInvoice?.id)
    .filter((id): id is string => !!id);

  const latestEventEntries = await Promise.all(
    issuedInvoiceIds.map(
      async (invoiceId): Promise<[string, InvoiceDeliveryEventRow | null]> => [
        invoiceId,
        await getLatestInvoiceDeliveryEventForActiveTenant({ invoiceId }),
      ],
    ),
  );
  const latestDeliveryEventByInvoiceId = new Map(latestEventEntries);

  return buildExecutiveReportSummary({
    roles: context.roles,
    projects,
    vessels,
    costSummaries,
    billingRows,
    latestDeliveryEventByInvoiceId,
  });
}
