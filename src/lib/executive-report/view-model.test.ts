import { describe, expect, it } from "vitest";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";
import { buildExecutiveAttentionBreakdown, buildExecutiveAttentionItems, buildExecutiveReportSummary } from "./view-model";

function billingRow(overrides: Partial<BillingWorkspaceRow>): BillingWorkspaceRow {
  return {
    projectId: "project-1",
    vesselName: "KM Uji",
    projectCode: "PRJ-1",
    clientId: "client-1",
    clientName: "PT Uji",
    lifecycleStatus: "closed",
    closedAt: "2026-02-01T00:00:00Z",
    status: "NO_INVOICE",
    activeInvoice: null,
    isUnbilledAlert: false,
    unbilledTransactionCount: 0,
    unbilledAmountTotal: 0,
    lastVoidedInvoiceId: null,
    lastVoidReason: null,
    ...overrides,
  };
}

function deliveryEvent(overrides: Partial<InvoiceDeliveryEventRow>): InvoiceDeliveryEventRow {
  return {
    id: "event-1",
    tenant_id: "tenant-1",
    invoice_id: "invoice-1",
    channel: "email",
    event_type: "sent",
    event_seq: 1,
    created_at: "2026-02-02T00:00:00Z",
    recipient_snapshot: "pic@client.co",
    recorded_by: "user-1",
    provider_reference: null,
    failure_reason: null,
    acknowledgment_note: null,
    ...overrides,
  } as InvoiceDeliveryEventRow;
}

describe("buildExecutiveAttentionItems", () => {
  it("tags an unbilled project (no active invoice) UNBILLED and traces to Billing Workspace", () => {
    const rows = [billingRow({ isUnbilledAlert: true, unbilledAmountTotal: 500_000, status: "NO_INVOICE" })];

    const items = buildExecutiveAttentionItems({ billingRows: rows, latestDeliveryEventByInvoiceId: new Map() });

    expect(items).toHaveLength(1);
    expect(items[0].tags).toEqual(["UNBILLED"]);
    expect(items[0].amount).toBe(500_000);
    expect(items[0].traceUrl).toBe("/billing/workspace/project-1");
  });

  it("tags a draft with DRAFT_INCOMPLETE status DRAFT_INCOMPLETE only — never combined with a delivery tag", () => {
    const rows = [
      billingRow({
        status: "DRAFT_INCOMPLETE",
        activeInvoice: { id: "invoice-draft", status: "draft", total_amount: 200_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      // Even if a stray event were mapped under this invoice id, draft
      // invoices must never receive delivery-derived tags.
      latestDeliveryEventByInvoiceId: new Map([["invoice-draft", deliveryEvent({ event_type: "failed" })]]),
    });

    expect(items).toHaveLength(1);
    expect(items[0].tags).toEqual(["DRAFT_INCOMPLETE"]);
    expect(items[0].traceUrl).toBe("/billing/invoices/invoice-draft");
  });

  it("does not tag a DRAFT_READY_TO_ISSUE draft — DRAFT_INCOMPLETE only applies to that exact status", () => {
    const rows = [
      billingRow({
        status: "DRAFT_READY_TO_ISSUE",
        activeInvoice: { id: "invoice-draft-2", status: "draft", total_amount: 300_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({ billingRows: rows, latestDeliveryEventByInvoiceId: new Map() });

    expect(items).toHaveLength(0);
  });

  it("tags an issued invoice with no delivery event yet NOT_DELIVERED + NOT_ACKNOWLEDGED", () => {
    const rows = [
      billingRow({
        status: "ISSUED_EVIDENCE_PENDING",
        activeInvoice: { id: "invoice-issued", status: "issued", total_amount: 1_000_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-issued", null]]),
    });

    expect(items[0].tags).toEqual(["NOT_DELIVERED", "NOT_ACKNOWLEDGED"]);
  });

  it("tags an issued invoice whose latest event is 'failed' DELIVERY_FAILED + NOT_ACKNOWLEDGED", () => {
    const rows = [
      billingRow({
        status: "ISSUED_EVIDENCE_PENDING",
        activeInvoice: { id: "invoice-failed", status: "issued", total_amount: 1_000_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-failed", deliveryEvent({ event_type: "failed", event_seq: 2 })]]),
    });

    expect(items[0].tags).toEqual(["DELIVERY_FAILED", "NOT_ACKNOWLEDGED"]);
  });

  it("tags an issued invoice whose latest event is 'sent'/'delivered' only NOT_ACKNOWLEDGED — no age threshold", () => {
    const rows = [
      billingRow({
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-sent", status: "issued", total_amount: 1_000_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-sent", deliveryEvent({ event_type: "delivered", event_seq: 2 })]]),
    });

    expect(items[0].tags).toEqual(["NOT_ACKNOWLEDGED"]);
  });

  it("omits an issued invoice entirely once its latest event is 'acknowledged'", () => {
    const rows = [
      billingRow({
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-ack", status: "issued", total_amount: 1_000_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-ack", deliveryEvent({ event_type: "acknowledged", event_seq: 3 })]]),
    });

    expect(items).toHaveLength(0);
  });

  it("counts one project once even when it carries multiple compatible tags (dedup, not per-tag rows)", () => {
    const rows = [
      billingRow({
        projectId: "project-multi",
        status: "ISSUED_EVIDENCE_PENDING",
        activeInvoice: { id: "invoice-multi", status: "issued", total_amount: 750_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const items = buildExecutiveAttentionItems({
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-multi", null]]),
    });

    expect(items).toHaveLength(1);
    expect(items[0].tags).toEqual(["NOT_DELIVERED", "NOT_ACKNOWLEDGED"]);
  });

  it("omits a NOT_CLOSED project with no invoice and no unbilled alert entirely", () => {
    const rows = [billingRow({ status: "NOT_CLOSED", isUnbilledAlert: false })];

    const items = buildExecutiveAttentionItems({ billingRows: rows, latestDeliveryEventByInvoiceId: new Map() });

    expect(items).toHaveLength(0);
  });
});

describe("buildExecutiveAttentionBreakdown", () => {
  it("is non-exclusive per tag and never summed into a total by this function", () => {
    const items = buildExecutiveAttentionItems({
      billingRows: [
        billingRow({ projectId: "p1", isUnbilledAlert: true, unbilledAmountTotal: 100_000 }),
        billingRow({
          projectId: "p2",
          status: "ISSUED_EVIDENCE_PENDING",
          activeInvoice: { id: "invoice-p2", status: "issued", total_amount: 200_000 } as BillingWorkspaceRow["activeInvoice"],
        }),
      ],
      latestDeliveryEventByInvoiceId: new Map([["invoice-p2", null]]),
    });

    const breakdown = buildExecutiveAttentionBreakdown(items);

    expect(breakdown).toEqual({
      unbilled: 1,
      draftIncomplete: 0,
      notDelivered: 1,
      deliveryFailed: 0,
      notAcknowledged: 1,
    });
    // Deduplicated total (2 projects) is strictly less than the sum of this
    // breakdown (1 + 1 + 1 = 3) — the breakdown must never be summed.
    expect(items).toHaveLength(2);
  });
});

describe("buildExecutiveReportSummary", () => {
  const PROJECT: VesselProjectRow = {
    id: "project-1",
    tenant_id: "tenant-1",
    vessel_id: "vessel-1",
    client_id: "client-1",
    service_type_id: "service-1",
    facility_location_id: null,
    project_code: "PRJ-1",
    lifecycle_status: "active",
    priority: "standard",
    start_date: "2026-01-01",
    closed_at: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
  } as VesselProjectRow;
  const VESSEL: VesselRow = { id: "vessel-1", vessel_name: "KM Uji" } as VesselRow;
  const COST_SUMMARY: VesselProjectCostSummaryRow = { project_id: "project-1", tenant_id: "tenant-1", total_cost: 4_500_000 } as VesselProjectCostSummaryRow;

  it("keeps costRunningTotal (active project cost) and issuedInvoices.valueTotal (billed value) as separate, never-summed fields", () => {
    const rows = [
      billingRow({
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-1", status: "issued", total_amount: 1_200_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const summary = buildExecutiveReportSummary({
      roles: ["owner"],
      projects: [PROJECT],
      vessels: [VESSEL],
      costSummaries: [COST_SUMMARY],
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-1", deliveryEvent({ event_type: "acknowledged" })]]),
    });

    expect(summary.activeProjectCount).toBe(1);
    expect(summary.costRunningTotal).toBe(4_500_000);
    expect(summary.issuedInvoices).toEqual({ count: 1, valueTotal: 1_200_000 });
    // Neither field leaks into the other — no combined "nilai pekerjaan" sum.
    expect(summary.costRunningTotal + summary.issuedInvoices.valueTotal).not.toBe(summary.costRunningTotal);
  });

  it("aggregates unbilled count/nominal from the billing rows", () => {
    const rows = [
      billingRow({ projectId: "p1", isUnbilledAlert: true, unbilledAmountTotal: 300_000 }),
      billingRow({ projectId: "p2", isUnbilledAlert: true, unbilledAmountTotal: 700_000 }),
    ];

    const summary = buildExecutiveReportSummary({
      roles: ["owner"],
      projects: [],
      vessels: [],
      costSummaries: [],
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map(),
    });

    expect(summary.unbilled).toEqual({ count: 2, amountTotal: 1_000_000 });
  });

  it("only counts issued-status invoices toward issuedInvoices — draft/void are excluded", () => {
    const rows = [
      billingRow({
        projectId: "p1",
        status: "DRAFT_INCOMPLETE",
        activeInvoice: { id: "invoice-draft", status: "draft", total_amount: 999_999 } as BillingWorkspaceRow["activeInvoice"],
      }),
      billingRow({
        projectId: "p2",
        status: "READY_TO_SEND",
        activeInvoice: { id: "invoice-issued", status: "issued", total_amount: 500_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const summary = buildExecutiveReportSummary({
      roles: ["owner"],
      projects: [],
      vessels: [],
      costSummaries: [],
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-issued", deliveryEvent({ event_type: "acknowledged" })]]),
    });

    expect(summary.issuedInvoices).toEqual({ count: 1, valueTotal: 500_000 });
  });

  it("sets attentionTotalCount to the deduplicated item count, not the sum of the breakdown", () => {
    const rows = [
      billingRow({ projectId: "p1", isUnbilledAlert: true, unbilledAmountTotal: 100_000 }),
      billingRow({
        projectId: "p2",
        status: "ISSUED_EVIDENCE_PENDING",
        activeInvoice: { id: "invoice-p2", status: "issued", total_amount: 200_000 } as BillingWorkspaceRow["activeInvoice"],
      }),
    ];

    const summary = buildExecutiveReportSummary({
      roles: ["owner"],
      projects: [],
      vessels: [],
      costSummaries: [],
      billingRows: rows,
      latestDeliveryEventByInvoiceId: new Map([["invoice-p2", null]]),
    });

    expect(summary.attentionTotalCount).toBe(2);
    const breakdownSum =
      summary.attentionBreakdown.unbilled +
      summary.attentionBreakdown.draftIncomplete +
      summary.attentionBreakdown.notDelivered +
      summary.attentionBreakdown.deliveryFailed +
      summary.attentionBreakdown.notAcknowledged;
    expect(breakdownSum).toBe(3);
    expect(summary.attentionTotalCount).not.toBe(breakdownSum);
  });
});
