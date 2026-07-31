import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceBillingSummaryRow, UnbilledVesselProjectRow } from "@/lib/invoice-evidence/types";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";

const getMorningBriefSourceRows = vi.fn();

vi.mock("./repository", () => ({
  getMorningBriefSourceRows: (...args: unknown[]) => getMorningBriefSourceRows(...args),
}));

const project: VesselProjectRow = {
  id: "project-1",
  tenant_id: "tenant-1",
  vessel_id: "vessel-1",
  client_id: "client-1",
  service_type_id: "service-1",
  facility_location_id: null,
  lifecycle_status: "active",
  priority: "standard",
  project_code: "PRJ-1",
  start_date: "2026-07-01",
  ready_to_close_at: null,
  closed_at: null,
  closed_by: null,
  created_at: "2026-07-01T00:00:00Z",
  created_by: null,
  updated_at: "2026-07-01T00:00:00Z",
} as VesselProjectRow;

const vessel: VesselRow = {
  id: "vessel-1",
  tenant_id: "tenant-1",
  vessel_name: "KM Uji",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as VesselRow;

const costSummary: VesselProjectCostSummaryRow = {
  project_id: "project-1",
  tenant_id: "tenant-1",
  total_cost: 40_000_000,
} as VesselProjectCostSummaryRow;

const client: ClientRow = {
  id: "client-1",
  tenant_id: "tenant-1",
  display_name: "PT Uji",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as ClientRow;

const invoice: InvoiceBillingSummaryRow = {
  id: "invoice-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  client_id: "client-1",
  status: "issued",
  total_amount: 75_000_000,
  invoice_number: "INV-1",
} as InvoiceBillingSummaryRow;

function deliveryEvent(overrides: Partial<InvoiceDeliveryEventRow>): InvoiceDeliveryEventRow {
  return {
    id: "event-1",
    tenant_id: "tenant-1",
    invoice_id: "invoice-1",
    channel: "email",
    event_type: "sent",
    event_seq: 1,
    created_at: "2026-07-01T00:00:00Z",
    recipient_snapshot: "pic@client.co",
    recorded_by: "user-1",
    provider_reference: null,
    failure_reason: null,
    acknowledgment_note: null,
    ...overrides,
  } as InvoiceDeliveryEventRow;
}

describe("getExecutiveReportSummaryForTenant", () => {
  beforeEach(() => {
    vi.resetModules();
    getMorningBriefSourceRows.mockReset();
  });

  it("composes the same figures buildExecutiveReportSummary would, from raw tenant-scoped rows", async () => {
    getMorningBriefSourceRows.mockResolvedValue({
      projects: [project],
      vessels: [vessel],
      costSummaries: [costSummary],
      clients: [client],
      invoices: [invoice],
      unbilled: [] as UnbilledVesselProjectRow[],
      deliveryEvents: [
        deliveryEvent({ id: "event-1", event_seq: 1, event_type: "sent" }),
        deliveryEvent({ id: "event-2", event_seq: 2, event_type: "delivered" }),
      ],
    });
    const { getExecutiveReportSummaryForTenant } = await import("./read-model");

    const summary = await getExecutiveReportSummaryForTenant("tenant-1");

    expect(summary.activeProjectCount).toBe(1);
    expect(summary.costRunningTotal).toBe(40_000_000);
    expect(summary.issuedInvoices).toEqual({ count: 1, valueTotal: 75_000_000 });
    expect(summary.unbilled).toEqual({ count: 0, amountTotal: 0 });
  });

  it("reduces multiple delivery events per invoice to the highest event_seq (the latest), never an earlier one", async () => {
    getMorningBriefSourceRows.mockResolvedValue({
      projects: [project],
      vessels: [vessel],
      costSummaries: [costSummary],
      clients: [client],
      invoices: [invoice],
      unbilled: [] as UnbilledVesselProjectRow[],
      deliveryEvents: [
        // Out of order on purpose — event_seq must win over array order.
        deliveryEvent({ id: "event-2", event_seq: 2, event_type: "delivered" }),
        deliveryEvent({ id: "event-1", event_seq: 1, event_type: "failed" }),
      ],
    });
    const { getExecutiveReportSummaryForTenant } = await import("./read-model");

    const summary = await getExecutiveReportSummaryForTenant("tenant-1");

    // The invoice is "delivered" (event_seq 2, the latest) — not
    // DELIVERY_FAILED (which event_seq 1 would have tagged), and not yet
    // acknowledged, so it should surface exactly one attention tag.
    expect(summary.attentionBreakdown.deliveryFailed).toBe(0);
    expect(summary.attentionBreakdown.notAcknowledged).toBe(1);
  });

  it("treats an invoice with zero delivery events as NOT_DELIVERED", async () => {
    getMorningBriefSourceRows.mockResolvedValue({
      projects: [project],
      vessels: [vessel],
      costSummaries: [costSummary],
      clients: [client],
      invoices: [invoice],
      unbilled: [] as UnbilledVesselProjectRow[],
      deliveryEvents: [],
    });
    const { getExecutiveReportSummaryForTenant } = await import("./read-model");

    const summary = await getExecutiveReportSummaryForTenant("tenant-1");

    expect(summary.attentionBreakdown.notDelivered).toBe(1);
  });
});
