import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { listInvoices, listInvoiceTransactionLines, listUnbilledVesselProjects } from "@/lib/invoice-evidence/repository";
import type { InvoiceBillingSummaryRow, InvoiceTransactionLineRow } from "@/lib/invoice-evidence/types";
import { listClients, type ClientRow } from "@/lib/master-data/clients/repository";
import { listVessels } from "@/lib/master-data/vessels/repository";
import { getVesselProjectById, listVesselProjects, type VesselProjectRow } from "@/lib/vessel-projects/repository";
import { computeBillingRecordCompleteness, type BillingCompleteness } from "./completeness";
import type { BillingWorkspaceRow } from "./types";
import { buildBillingWorkspaceRows } from "./view-model";

// Read-only composition over reads the Invoice & Evidence, Project Kapal,
// and Master Data pages already perform (listVesselProjects, listVessels,
// listClients, listInvoices) plus the Phase 2A Unbilled Vessel Alert read
// model (listUnbilledVesselProjects) — no new RPC/schema, no writes.
export async function listBillingWorkspaceForActiveTenant(): Promise<BillingWorkspaceRow[]> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const [projects, vessels, clients, invoices, unbilled] = await Promise.all([
    listVesselProjects(context.tenantId),
    listVessels(context.tenantId),
    listClients(context.tenantId),
    listInvoices(context.tenantId),
    listUnbilledVesselProjects(context.tenantId),
  ]);

  return buildBillingWorkspaceRows({ projects, vessels, clients, invoices, unbilled });
}

export interface BillingRecordDetail {
  project: VesselProjectRow;
  client: ClientRow | null;
  vesselName: string;
  activeInvoice: InvoiceBillingSummaryRow | null;
  voidInvoices: InvoiceBillingSummaryRow[];
  lines: InvoiceTransactionLineRow[];
  completeness: BillingCompleteness;
}

// Project-centric billing detail — composes the same already-authorized
// reads (get_invoice_summary's list-form via listInvoices, filtered by
// project_id; invoice_transaction_lines) rather than adding a new
// project-scoped RPC. Lifecycle actions (issue/void/bind/evidence) are not
// duplicated here — the detail page links out to the existing
// /billing/invoices/[invoiceId] page for those.
export async function getBillingRecordDetailForActiveTenant(projectId: string): Promise<BillingRecordDetail | null> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const project = await getVesselProjectById(context.tenantId, projectId);
  if (!project) return null;

  const [vessels, clients, invoices] = await Promise.all([
    listVessels(context.tenantId),
    listClients(context.tenantId),
    listInvoices(context.tenantId),
  ]);

  const vesselName = vessels.find((vessel) => vessel.id === project.vessel_id)?.vessel_name ?? "Kapal tidak dikenal";
  const client = clients.find((row) => row.id === project.client_id) ?? null;

  const projectInvoices = invoices.filter((invoice) => invoice.project_id === projectId);
  const activeInvoice =
    projectInvoices
      .filter((invoice) => invoice.status === "draft" || invoice.status === "issued")
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;
  const voidInvoices = projectInvoices
    .filter((invoice) => invoice.status === "void")
    .sort((a, b) => (b.void_at ?? "").localeCompare(a.void_at ?? ""));

  const lines =
    activeInvoice?.id ? await listInvoiceTransactionLines(context.tenantId, activeInvoice.id) : [];

  const completeness = computeBillingRecordCompleteness({ project, client, invoice: activeInvoice, lines });

  return { project, client, vesselName, activeInvoice, voidInvoices, lines, completeness };
}
