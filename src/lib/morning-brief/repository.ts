import "server-only";
import type { InvoiceBillingSummaryRow, UnbilledVesselProjectRow } from "@/lib/invoice-evidence/types";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";

// Service-role only, by design. getExecutiveReportForActiveTenant() and the
// *ForActiveTenant reads it composes all require requireTenantContext() —
// a signed-in user's cookie session — which n8n's scheduled trigger has
// none of. This module is the ONLY place in the codebase allowed to read
// the underlying tables/views for Morning Brief (enforced by
// admin-client-only.test.ts), each of which already grants SELECT to
// service_role directly (see the migrations that created them) — no new
// RPC or grant was needed for these reads. It performs the exact same
// queries the existing *ForActiveTenant repository functions do, just
// scoped explicitly by a server-resolved tenantId instead of a session, and
// hands the raw rows to the SAME unchanged pure view-model functions
// (buildExecutiveReportSummary, buildBillingWorkspaceRows) — no business
// logic is duplicated here, only the RLS-bypassing data fetch.

export interface PilotTenant {
  tenantId: string;
}

// tenants.slug is unique (schema constraint), so a match can never be
// ambiguous — "tenant harus aktif dan unik" is satisfied by the column
// constraint itself plus the explicit status check below, not by extra
// application logic.
export async function resolvePilotTenant(): Promise<PilotTenant | null> {
  const slug = getServerEnv().MORNING_BRIEF_PILOT_TENANT_SLUG;
  if (!slug) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("tenants").select("id, status").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") return null;

  return { tenantId: data.id };
}

export interface MorningBriefSourceRows {
  projects: VesselProjectRow[];
  vessels: VesselRow[];
  costSummaries: VesselProjectCostSummaryRow[];
  clients: ClientRow[];
  invoices: InvoiceBillingSummaryRow[];
  unbilled: UnbilledVesselProjectRow[];
  deliveryEvents: InvoiceDeliveryEventRow[];
}

// Mirrors listVesselProjects/listVessels/listVesselProjectCostSummary/
// listClients/listInvoices(no status filter)/listUnbilledVesselProjects/
// getLatestInvoiceDeliveryEvent exactly (same tables/views, same tenant_id
// filter) — see each domain's own repository.ts for the originals this is
// kept in lockstep with.
export async function getMorningBriefSourceRows(tenantId: string): Promise<MorningBriefSourceRows> {
  const admin = createSupabaseAdminClient();

  const [projects, vessels, costSummaries, clients, invoices, unbilled, deliveryEvents] = await Promise.all([
    admin.from("vessel_projects").select("*").eq("tenant_id", tenantId),
    admin.from("vessels").select("*").eq("tenant_id", tenantId),
    admin.from("vessel_project_cost_summary").select("*").eq("tenant_id", tenantId),
    admin.from("clients").select("*").eq("tenant_id", tenantId),
    admin.from("invoice_billing_summary").select("*").eq("tenant_id", tenantId),
    admin.from("unbilled_vessel_projects").select("*").eq("tenant_id", tenantId),
    admin.from("invoice_delivery_events").select("*").eq("tenant_id", tenantId),
  ]);

  for (const result of [projects, vessels, costSummaries, clients, invoices, unbilled, deliveryEvents]) {
    if (result.error) throw result.error;
  }

  return {
    projects: projects.data ?? [],
    vessels: vessels.data ?? [],
    costSummaries: costSummaries.data ?? [],
    clients: clients.data ?? [],
    invoices: invoices.data ?? [],
    unbilled: unbilled.data ?? [],
    deliveryEvents: deliveryEvents.data ?? [],
  };
}
