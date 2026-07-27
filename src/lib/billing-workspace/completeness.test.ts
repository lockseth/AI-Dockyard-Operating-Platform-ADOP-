import { describe, expect, it } from "vitest";
import type { InvoiceBillingSummaryRow, InvoiceTransactionLineRow } from "@/lib/invoice-evidence/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import { computeBillingRecordCompleteness } from "./completeness";

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
    billing_completeness_status: "DRAFT_READY_TO_ISSUE",
    ...overrides,
  } as InvoiceBillingSummaryRow;
}

function line(overrides: Partial<InvoiceTransactionLineRow> = {}): InvoiceTransactionLineRow {
  return {
    id: "line-1",
    tenant_id: "tenant-1",
    invoice_id: "invoice-1",
    project_id: "project-1",
    transaction_entry_id: "entry-1",
    description: "Jasa docking",
    amount: 1_000_000,
    transaction_date: "2026-01-15",
    transaction_category: null,
    created_at: "2026-02-05T00:00:00Z",
    ...overrides,
  } as InvoiceTransactionLineRow;
}

describe("computeBillingRecordCompleteness", () => {
  it("is BELUM_LENGKAP when there is no Billing Record at all", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: null,
      lines: [],
    });
    expect(completeness.result).toBe("BELUM_LENGKAP");
    expect(completeness.checks.find((c) => c.key === "billing_record_exists")?.ok).toBe(false);
  });

  it("is BELUM_LENGKAP when the project is not yet closed, even with a complete invoice", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project({ lifecycle_status: "active" }),
      client: client(),
      invoice: invoice(),
      lines: [line()],
    });
    expect(completeness.result).toBe("BELUM_LENGKAP");
    expect(completeness.checks.find((c) => c.key === "project_status")?.ok).toBe(false);
  });

  it("is BELUM_LENGKAP when client billing identity (legal name/address) is missing", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client({ legal_name: null }),
      invoice: invoice(),
      lines: [line()],
    });
    expect(completeness.result).toBe("BELUM_LENGKAP");
    expect(completeness.checks.find((c) => c.key === "customer_identity")?.ok).toBe(false);
  });

  it("is BELUM_LENGKAP when billing metadata is incomplete", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice({ invoice_number: null }),
      lines: [line()],
    });
    expect(completeness.result).toBe("BELUM_LENGKAP");
    expect(completeness.checks.find((c) => c.key === "billing_metadata")?.ok).toBe(false);
  });

  it("is BELUM_LENGKAP when a covered line has no valid amount", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice(),
      lines: [line({ amount: 0 })],
    });
    expect(completeness.result).toBe("BELUM_LENGKAP");
    expect(completeness.checks.find((c) => c.key === "line_amounts")?.ok).toBe(false);
  });

  it("is PERLU_DIPERIKSA when the invoice is issued but the final document isn't verified yet", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice({ status: "issued", is_final_document: false, billing_completeness_status: "ISSUED_EVIDENCE_PENDING" }),
      lines: [line()],
    });
    expect(completeness.result).toBe("PERLU_DIPERIKSA");
    expect(completeness.checks.find((c) => c.key === "evidence_verified")?.ok).toBe(false);
  });

  it("is SIAP_DITAGIH when every check passes", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice({ status: "issued", is_final_document: true, billing_completeness_status: "READY_TO_SEND" }),
      lines: [line()],
    });
    expect(completeness.result).toBe("SIAP_DITAGIH");
    expect(completeness.checks.every((c) => c.ok)).toBe(true);
  });

  it("does not block a legacy invoice on a missing due date (Contract §15.2 — legacy due date may be unknown)", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice({ origin: "legacy_import", due_date: null, billing_completeness_status: "LEGACY_RECORDED" }),
      lines: [line()],
    });
    expect(completeness.checks.find((c) => c.key === "billing_metadata")?.blocking).toBe(false);
    expect(completeness.result).not.toBe("BELUM_LENGKAP");
  });

  it("does not block a legacy invoice on missing coverage (Contract §15.7 — legacy coverage may not be fully reconstructable)", () => {
    const completeness = computeBillingRecordCompleteness({
      project: project(),
      client: client(),
      invoice: invoice({ origin: "legacy_import", legacy_coverage_status: "unknown", billing_completeness_status: "LEGACY_RECORDED" }),
      lines: [],
    });
    const coverageCheck = completeness.checks.find((c) => c.key === "coverage_recap");
    expect(coverageCheck?.ok).toBe(false);
    expect(coverageCheck?.blocking).toBe(false);
    expect(completeness.result).toBe("PERLU_DIPERIKSA");
  });
});
