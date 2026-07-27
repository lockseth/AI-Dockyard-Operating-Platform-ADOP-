import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildInvoiceCostRecapFilename,
  buildInvoiceCostRecapRows,
  buildInvoiceCostRecapWorkbook,
  sumInvoiceCostRecapRows,
  type InvoiceCostRecap,
} from "./cost-recap";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { InvoiceBillingSummaryRow, InvoiceTransactionLineRow } from "./types";

function project(overrides: Partial<VesselProjectRow>): VesselProjectRow {
  return {
    id: "project-1",
    tenant_id: "tenant-1",
    vessel_id: "vessel-1",
    client_id: "client-1",
    service_type_id: "service-1",
    facility_location_id: "facility-1",
    project_code: "PRJ-001",
    lifecycle_status: "closed",
    start_date: "2026-07-01",
    ready_to_close_at: null,
    closed_at: null,
    closed_by: null,
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as VesselProjectRow;
}

function vessel(overrides: Partial<VesselRow>): VesselRow {
  return {
    id: "vessel-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    vessel_name: "MV Contoh",
    vessel_code: null,
    vessel_type: null,
    registration_number: null,
    status: "active",
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as VesselRow;
}

function client(overrides: Partial<ClientRow>): ClientRow {
  return {
    id: "client-1",
    tenant_id: "tenant-1",
    client_code: null,
    display_name: "PT Contoh Pelayaran",
    legal_name: null,
    address: "Jl. Contoh No. 1",
    tax_identifier: null,
    status: "active",
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as ClientRow;
}

function line(overrides: Partial<InvoiceTransactionLineRow>): InvoiceTransactionLineRow {
  return {
    id: "line-1",
    tenant_id: "tenant-1",
    invoice_id: "invoice-1",
    transaction_entry_id: "entry-1",
    project_id: "project-1",
    amount: 100_000,
    description: "Biaya docking",
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as InvoiceTransactionLineRow;
}

function invoice(overrides: Partial<InvoiceBillingSummaryRow>): InvoiceBillingSummaryRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
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
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    line_count: 1,
    total_amount: 100_000,
    evidence_id: null,
    current_version_id: null,
    current_version_number: null,
    current_version_status: null,
    is_final_document: false,
    ...overrides,
  } as InvoiceBillingSummaryRow;
}

describe("buildInvoiceCostRecapRows", () => {
  it("joins each line to its project/vessel/client via id lookups", () => {
    const rows = buildInvoiceCostRecapRows(
      [line({ id: "line-1", project_id: "project-1", amount: 250_000, description: "Docking" })],
      [project({ id: "project-1", vessel_id: "vessel-1", client_id: "client-1", project_code: "PRJ-42" })],
      [vessel({ id: "vessel-1", vessel_name: "MV Sejahtera" })],
      [client({ id: "client-1", display_name: "PT Pelayaran Jaya" })],
    );

    expect(rows).toEqual([
      {
        lineId: "line-1",
        projectCode: "PRJ-42",
        vesselName: "MV Sejahtera",
        clientName: "PT Pelayaran Jaya",
        description: "Docking",
        amount: 250_000,
      },
    ]);
  });

  it("never fabricates a name when a project/vessel/client lookup misses — falls back to an explicit unknown label", () => {
    const rows = buildInvoiceCostRecapRows([line({ project_id: "missing-project" })], [], [], []);

    expect(rows[0].vesselName).toBe("Kapal tidak dikenal");
    expect(rows[0].clientName).toBe("Klien tidak dikenal");
    expect(rows[0].projectCode).toBeNull();
  });

  it("preserves the snapshot amount/description verbatim — never recomputes them", () => {
    const rows = buildInvoiceCostRecapRows(
      [line({ amount: 999_999, description: "Snapshot description" })],
      [project({})],
      [vessel({})],
      [client({})],
    );

    expect(rows[0].amount).toBe(999_999);
    expect(rows[0].description).toBe("Snapshot description");
  });
});

describe("sumInvoiceCostRecapRows", () => {
  it("sums row amounts and matches the invoice's own total_amount snapshot for a consistent fixture", () => {
    const lines = [line({ id: "l1", amount: 100_000 }), line({ id: "l2", amount: 250_000 })];
    const rows = buildInvoiceCostRecapRows(lines, [project({})], [vessel({})], [client({})]);

    expect(sumInvoiceCostRecapRows(rows)).toBe(350_000);
  });

  it("returns 0 for an invoice with no bound lines", () => {
    expect(sumInvoiceCostRecapRows([])).toBe(0);
  });
});

describe("buildInvoiceCostRecapFilename", () => {
  it("includes the invoice id prefix and a Jakarta-local date key", () => {
    const filename = buildInvoiceCostRecapFilename(invoice({ id: "abcdef12-3456-4111-8111-111111111111" }), new Date("2026-07-27T20:00:00Z"));
    expect(filename).toBe("rekap-biaya-invoice-abcdef12-20260728.xlsx");
  });
});

describe("buildInvoiceCostRecapWorkbook", () => {
  function readSheet(recap: InvoiceCostRecap, now: Date) {
    const buffer = buildInvoiceCostRecapWorkbook(recap, now);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  }

  it("renders the tenant name, invoice status label, line rows, and a matching TOTAL row", () => {
    const lines = [line({ id: "l1", amount: 100_000, description: "Biaya A" }), line({ id: "l2", amount: 50_000, description: "Biaya B" })];
    const rows = buildInvoiceCostRecapRows(lines, [project({ project_code: "PRJ-9" })], [vessel({ vessel_name: "MV Uji" })], [client({ display_name: "PT Uji" })]);
    const recap: InvoiceCostRecap = { invoice: invoice({ status: "issued", issued_at: "2026-07-20T00:00:00Z", line_count: 2, total_amount: 150_000 }), tenantDisplayName: "PT Gamatara Dockyard", rows };

    const sheet = readSheet(recap, new Date("2026-07-27T03:00:00Z"));
    const flattened = sheet.map((r) => r.join(" | ")).join("\n");

    expect(flattened).toContain("PT Gamatara Dockyard");
    expect(flattened).toContain("Diterbitkan");
    expect(sheet).toContainEqual([1, "PRJ-9", "MV Uji", "PT Uji", "Biaya A", 100_000]);
    expect(sheet).toContainEqual([2, "PRJ-9", "MV Uji", "PT Uji", "Biaya B", 50_000]);
    expect(sheet).toContainEqual(["", "", "", "", "TOTAL", 150_000]);
  });

  it("labels a draft invoice recap as non-final so it cannot be mistaken for the signed invoice", () => {
    const recap: InvoiceCostRecap = { invoice: invoice({ status: "draft" }), tenantDisplayName: "PT Gamatara Dockyard", rows: [] };
    const sheet = readSheet(recap, new Date("2026-07-27T03:00:00Z"));
    const flattened = sheet.map((r) => r.join(" | ")).join("\n");
    expect(flattened).toContain("DRAFT");
    expect(flattened).toContain("bukan dokumen final");
  });

  it("labels a void invoice recap with its void reason and marks it unfit for billing", () => {
    const recap: InvoiceCostRecap = {
      invoice: invoice({ status: "void", void_at: "2026-07-25T00:00:00Z", void_reason: "Salah proyek" }),
      tenantDisplayName: "PT Gamatara Dockyard",
      rows: [],
    };
    const sheet = readSheet(recap, new Date("2026-07-27T03:00:00Z"));
    const flattened = sheet.map((r) => r.join(" | ")).join("\n");
    expect(flattened).toContain("VOID");
    expect(flattened).toContain("bukan dasar penagihan");
    expect(flattened).toContain("Salah proyek");
  });
});
