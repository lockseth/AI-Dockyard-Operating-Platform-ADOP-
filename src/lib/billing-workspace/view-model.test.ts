import { describe, expect, it } from "vitest";
import type { InvoiceBillingSummaryRow, UnbilledVesselProjectRow } from "@/lib/invoice-evidence/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import { buildBillingWorkspaceRows, computeBillingWorkspaceKpis, filterBillingWorkspaceRows } from "./view-model";

function project(overrides: Partial<VesselProjectRow> = {}): VesselProjectRow {
  return {
    id: "project-1",
    tenant_id: "tenant-1",
    vessel_id: "vessel-1",
    client_id: "client-1",
    service_type_id: "service-1",
    facility_location_id: null,
    project_code: "PRJ-001",
    priority: "standard",
    lifecycle_status: "closed",
    start_date: "2026-01-01",
    ready_to_close_at: null,
    closed_at: "2026-02-01T00:00:00Z",
    closed_by: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as VesselProjectRow;
}

function vessel(overrides: Partial<VesselRow> = {}): VesselRow {
  return {
    id: "vessel-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    vessel_name: "KM Contoh",
    vessel_code: null,
    vessel_type: null,
    registration_number: null,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as VesselRow;
}

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "client-1",
    tenant_id: "tenant-1",
    client_code: null,
    display_name: "PT Contoh",
    legal_name: "PT Contoh Sejahtera",
    address: "Jl. Contoh No. 1",
    tax_identifier: null,
    default_payment_term_days: null,
    invoice_delivery_preference: null,
    status: "active",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as ClientRow;
}

function invoice(overrides: Partial<InvoiceBillingSummaryRow> = {}): InvoiceBillingSummaryRow {
  return {
    id: "invoice-1",
    tenant_id: "tenant-1",
    status: "draft",
    predecessor_invoice_id: null,
    successor_invoice_id: null,
    issued_at: null,
    issued_by: null,
    void_at: null,
    void_by: null,
    void_reason: null,
    created_by: null,
    created_at: "2026-02-05T00:00:00Z",
    updated_at: "2026-02-05T00:00:00Z",
    line_count: 1,
    total_amount: 1_000_000,
    evidence_id: null,
    current_version_id: null,
    current_version_number: null,
    current_version_status: null,
    is_final_document: false,
    legal_entity_id: "legal-1",
    client_id: "client-1",
    project_id: "project-1",
    invoice_number: "INV-001",
    invoice_date: "2026-02-05",
    due_date: "2026-02-15",
    origin: "native",
    legacy_coverage_status: null,
    imported_by: null,
    imported_at: null,
    billing_completeness_status: "DRAFT_INCOMPLETE",
    ...overrides,
  } as InvoiceBillingSummaryRow;
}

function unbilled(overrides: Partial<UnbilledVesselProjectRow> = {}): UnbilledVesselProjectRow {
  return {
    project_id: "project-1",
    tenant_id: "tenant-1",
    vessel_id: "vessel-1",
    vessel_name: "KM Contoh",
    client_id: "client-1",
    closed_at: "2026-02-01T00:00:00Z",
    unbilled_transaction_count: 2,
    unbilled_amount_total: 500_000,
    last_voided_invoice_id: null,
    last_void_reason: null,
    ...overrides,
  } as UnbilledVesselProjectRow;
}

describe("buildBillingWorkspaceRows", () => {
  it("marks a project not yet closed as NOT_CLOSED, regardless of invoices", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project({ lifecycle_status: "active" })],
      vessels: [vessel()],
      clients: [client()],
      invoices: [],
      unbilled: [],
    });
    expect(rows[0].status).toBe("NOT_CLOSED");
    expect(rows[0].isUnbilledAlert).toBe(false);
  });

  it("marks a closed project with no active invoice as NO_INVOICE and flags the unbilled alert from the read model", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project()],
      vessels: [vessel()],
      clients: [client()],
      invoices: [],
      unbilled: [unbilled()],
    });
    expect(rows[0].status).toBe("NO_INVOICE");
    expect(rows[0].isUnbilledAlert).toBe(true);
    expect(rows[0].unbilledTransactionCount).toBe(2);
    expect(rows[0].unbilledAmountTotal).toBe(500_000);
  });

  it("passes through the invoice's own billing_completeness_status for a closed project with an active invoice", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project()],
      vessels: [vessel()],
      clients: [client()],
      invoices: [invoice({ status: "issued", billing_completeness_status: "READY_TO_SEND" })],
      unbilled: [],
    });
    expect(rows[0].status).toBe("READY_TO_SEND");
    expect(rows[0].activeInvoice?.id).toBe("invoice-1");
  });

  it("ignores a void-only invoice — the project is treated as NO_INVOICE, matching Contract §13.1 #3", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project()],
      vessels: [vessel()],
      clients: [client()],
      invoices: [invoice({ status: "void", billing_completeness_status: "VOID" })],
      unbilled: [unbilled({ last_voided_invoice_id: "invoice-1", last_void_reason: "Salah nomor" })],
    });
    expect(rows[0].status).toBe("NO_INVOICE");
    expect(rows[0].activeInvoice).toBeNull();
    expect(rows[0].lastVoidedInvoiceId).toBe("invoice-1");
    expect(rows[0].lastVoidReason).toBe("Salah nomor");
  });

  it("resolves vessel and client names from the joined lookups", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project()],
      vessels: [vessel({ vessel_name: "KM Sejahtera" })],
      clients: [client({ display_name: "PT Pelayaran Jaya" })],
      invoices: [],
      unbilled: [],
    });
    expect(rows[0].vesselName).toBe("KM Sejahtera");
    expect(rows[0].clientName).toBe("PT Pelayaran Jaya");
  });

  it("falls back to a placeholder label when the vessel/client lookup is missing", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [project()],
      vessels: [],
      clients: [],
      invoices: [],
      unbilled: [],
    });
    expect(rows[0].vesselName).toBe("Kapal tidak dikenal");
    expect(rows[0].clientName).toBe("Client tidak dikenal");
  });
});

describe("computeBillingWorkspaceKpis", () => {
  it("counts each KPI independently — overlap between categories is expected", () => {
    const rows = buildBillingWorkspaceRows({
      projects: [
        project({ id: "p-unbilled" }),
        project({ id: "p-incomplete" }),
        project({ id: "p-ready" }),
        project({ id: "p-not-closed", lifecycle_status: "active" }),
      ],
      vessels: [vessel()],
      clients: [client()],
      invoices: [
        invoice({ id: "inv-incomplete", project_id: "p-incomplete", status: "draft", billing_completeness_status: "DRAFT_INCOMPLETE" }),
        invoice({ id: "inv-ready", project_id: "p-ready", status: "draft", billing_completeness_status: "DRAFT_READY_TO_ISSUE" }),
      ],
      unbilled: [unbilled({ project_id: "p-unbilled" })],
    });

    const kpis = computeBillingWorkspaceKpis(rows);
    expect(kpis.unbilledCount).toBe(1);
    expect(kpis.incompleteCount).toBe(1);
    expect(kpis.readyCount).toBe(1);
    expect(kpis.hasInvoiceCount).toBe(2);
  });
});

describe("filterBillingWorkspaceRows", () => {
  const rows = buildBillingWorkspaceRows({
    projects: [
      project({ id: "p-1", project_code: "PRJ-001", vessel_id: "vessel-1" }),
      project({ id: "p-2", project_code: "PRJ-002", vessel_id: "vessel-2" }),
    ],
    vessels: [vessel({ id: "vessel-1", vessel_name: "KM Alpha" }), vessel({ id: "vessel-2", vessel_name: "KM Beta" })],
    clients: [client()],
    invoices: [],
    unbilled: [unbilled({ project_id: "p-1" }), unbilled({ project_id: "p-2" })],
  });

  it("filters by case-insensitive search across vessel, project code, and client name", () => {
    const filtered = filterBillingWorkspaceRows(rows, { search: "alpha" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].vesselName).toBe("KM Alpha");
  });

  it("filters by status", () => {
    const filtered = filterBillingWorkspaceRows(rows, { status: "NO_INVOICE" });
    expect(filtered).toHaveLength(2);
  });

  it("returns every row when no filter is applied", () => {
    expect(filterBillingWorkspaceRows(rows, {})).toHaveLength(2);
  });
});
