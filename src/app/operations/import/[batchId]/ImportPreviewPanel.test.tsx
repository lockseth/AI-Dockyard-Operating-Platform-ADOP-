// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImportPreviewPanel } from "./ImportPreviewPanel";
import { buildCanonicalCommitPreview } from "@/lib/cash-import-staging/canonical-preview";
import type { CashImportBatchRow, CashImportRowRow } from "@/lib/cash-import-staging/repository";

function batch(overrides: Partial<CashImportBatchRow> = {}): CashImportBatchRow {
  return {
    id: "batch-id",
    tenant_id: "tenant-id",
    source_filename: "laporan.xlsx",
    source_sha256: "sha",
    source_sheet_name: "Sheet1",
    business_date: "2036-07-17",
    opening_balance: 0,
    total_debit: 0,
    total_credit: 0,
    calculated_closing_balance: 0,
    workbook_closing_balance: 0,
    transaction_count: 0,
    warning_count: 0,
    error_count: 0,
    status: "draft",
    created_by: null,
    created_at: "2036-07-17T00:00:00Z",
    updated_at: "2036-07-17T00:00:00Z",
    committed_at: null,
    committed_by: null,
    canonical_opening_cash: null,
    canonical_cash_top_up_total: null,
    canonical_project_refund_total: null,
    canonical_project_expense_total: null,
    canonical_shared_overhead_total: null,
    canonical_closing_cash: null,
    ...overrides,
  } as CashImportBatchRow;
}

function row(overrides: Partial<CashImportRowRow> = {}): CashImportRowRow {
  return {
    id: "row-id",
    tenant_id: "tenant-id",
    batch_id: "batch-id",
    source_row_number: 1,
    source_fingerprint: "fp",
    description: null,
    vessel_label: null,
    debit: null,
    credit: null,
    workbook_balance: null,
    calculated_balance: null,
    provisional_classification: "manual_mapping_required",
    status: "valid",
    mapping_kind: null,
    mapped_vessel_project_id: null,
    disposition: null,
    disposition_reason: null,
    validation_issues: [],
    duplicate_group_key: null,
    created_at: "2036-01-01T00:00:00Z",
    updated_at: "2036-01-01T00:00:00Z",
    ...overrides,
  } as CashImportRowRow;
}

describe("ImportPreviewPanel", () => {
  it("shows valid/warning/error/duplicate row counts and totals", () => {
    const rows = [
      row({ id: "r1", status: "valid" }),
      row({ id: "r2", status: "warning" }),
      row({ id: "r3", status: "error" }),
      row({ id: "r4", status: "valid", duplicate_group_key: "dup-1" }),
    ];
    const preview = buildCanonicalCommitPreview(batch(), rows);
    render(<ImportPreviewPanel rows={rows} preview={preview} />);

    expect(screen.getByText("Jumlah Baris")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument(); // row count
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Error/Blocked")).toBeInTheDocument();
    expect(screen.getByText("Kandidat Duplikat")).toBeInTheDocument();
    expect(screen.getByText("Total Dampak Kas")).toBeInTheDocument();
    expect(screen.getByText("Total Project Cost")).toBeInTheDocument();
    expect(screen.getByText("Shared Overhead")).toBeInTheDocument();
    expect(screen.getByText("Refund/Cash-In")).toBeInTheDocument();
  });

  it("shows a BLOCKED explanation listing every blocker when the preview has blockers", () => {
    const preview = buildCanonicalCommitPreview(batch({ error_count: 1 }), [], true);
    render(<ImportPreviewPanel rows={[]} preview={preview} />);

    expect(screen.getByText(/belum dapat diajukan\/disetujui/)).toBeInTheDocument();
    expect(screen.getByText(/Kas harian tanggal ini sudah memiliki transaksi/)).toBeInTheDocument();
    expect(screen.getByText(/Masih ada baris berstatus error/)).toBeInTheDocument();
  });

  it("shows a ready-to-submit message when there are no blockers", () => {
    const preview = buildCanonicalCommitPreview(batch(), []);
    render(<ImportPreviewPanel rows={[]} preview={preview} />);

    expect(screen.getByText(/siap diajukan untuk review/)).toBeInTheDocument();
  });
});
