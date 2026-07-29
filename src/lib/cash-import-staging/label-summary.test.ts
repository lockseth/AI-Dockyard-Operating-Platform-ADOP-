import { describe, expect, it } from "vitest";
import { summarizeCashImportBatchDecisions, summarizeCashImportLabels } from "./label-summary";
import type { CashImportBatchRow, CashImportRowRow } from "./repository";

function row(overrides: Partial<CashImportRowRow>): CashImportRowRow {
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

function batch(overrides: Partial<CashImportBatchRow>): CashImportBatchRow {
  return {
    id: "batch-id",
    tenant_id: "tenant-id",
    source_filename: "laporan.xlsx",
    source_sha256: "sha",
    source_sheet_name: "Sheet1",
    business_date: "2036-07-17",
    opening_balance: 7_870_794,
    total_debit: 0,
    total_credit: 0,
    calculated_closing_balance: 0,
    workbook_closing_balance: 0,
    transaction_count: 0,
    warning_count: 0,
    error_count: 0,
    status: "committed",
    created_by: null,
    created_at: "2036-07-17T00:00:00Z",
    updated_at: "2036-07-17T00:00:00Z",
    committed_at: "2036-07-18T00:00:00Z",
    committed_by: "owner-1",
    canonical_opening_cash: null,
    canonical_cash_top_up_total: null,
    canonical_project_refund_total: null,
    canonical_project_expense_total: null,
    canonical_shared_overhead_total: null,
    canonical_closing_cash: null,
    ...overrides,
  } as CashImportBatchRow;
}

describe("summarizeCashImportLabels", () => {
  it("excludes the opening balance row", () => {
    const rows = [row({ provisional_classification: "opening_cash", vessel_label: null })];
    expect(summarizeCashImportLabels(rows)).toHaveLength(0);
  });

  it("groups rows by vessel_label, including a null-label group", () => {
    const rows = [
      row({ id: "1", vessel_label: "Kas" }),
      row({ id: "2", vessel_label: "Kas" }),
      row({ id: "3", vessel_label: null }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary).toHaveLength(2);
    const kas = summary.find((s) => s.vesselLabel === "Kas");
    expect(kas?.rowCount).toBe(2);
    const nullGroup = summary.find((s) => s.vesselLabel === null);
    expect(nullGroup?.rowCount).toBe(1);
  });

  it("suggests cash for Kas and reports mappingKind null when unset", () => {
    const rows = [row({ id: "1", vessel_label: "Kas", mapping_kind: null })];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].suggestedMappingKind).toBe("cash");
    expect(summary[0].mappingKind).toBeNull();
    expect(summary[0].unmappedCount).toBe(1);
  });

  it("reports a consistent mappingKind once every row in the group is mapped the same way", () => {
    const rows = [
      row({ id: "1", vessel_label: "KM Sejahtera", mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "proj-1" }),
      row({ id: "2", vessel_label: "KM Sejahtera", mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "proj-1" }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].mappingKind).toBe("existing_vessel_project");
    expect(summary[0].mappedVesselProjectId).toBe("proj-1");
    expect(summary[0].unmappedCount).toBe(0);
  });

  it("reports mappingKind null when rows in the same group disagree (mixed/transient state)", () => {
    const rows = [
      row({ id: "1", vessel_label: "KM Sejahtera", mapping_kind: "cash" }),
      row({ id: "2", vessel_label: "KM Sejahtera", mapping_kind: "shared_overhead" }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].mappingKind).toBeNull();
  });
});

// Gate 6I-C regression: an applied (committed) batch's decision summary must
// represent the committed outcome — five auto-included transaction rows plus
// an opening balance that is reconciliation-only, never counted as a
// decision row, and zero blockers once the caller correctly reports no
// opening-balance conflict (the batch's own postings must never be read back
// as a conflict against itself).
describe("summarizeCashImportBatchDecisions", () => {
  function autoIncludedRow(overrides: Partial<CashImportRowRow>): CashImportRowRow {
    return row({
      mapping_kind: "existing_vessel_project",
      mapped_vessel_project_id: "project-a",
      disposition: "include",
      disposition_reason: "Auto-disposition: baris valid, dimasukkan otomatis.",
      credit: 1_000_000,
      ...overrides,
    });
  }

  it("counts includedRows off each row's own disposition — 5 for 5 auto-included rows, excluding the opening balance", () => {
    const rows: CashImportRowRow[] = [
      row({ id: "opening", provisional_classification: "opening_cash" }),
      autoIncludedRow({ id: "r1" }),
      autoIncludedRow({ id: "r2" }),
      autoIncludedRow({ id: "r3" }),
      autoIncludedRow({ id: "r4" }),
      autoIncludedRow({ id: "r5" }),
    ];

    const summary = summarizeCashImportBatchDecisions(batch({}), rows, [], false);

    expect(summary.totalRows).toBe(6);
    expect(summary.includedRows).toBe(5);
    expect(summary.autoDecidedRows).toBe(5);
    expect(summary.manualReviewRows).toBe(0);
    expect(summary.blockedRows).toBe(0);
  });

  it("still counts includedRows correctly when a row was decided manually (no Auto-disposition reason)", () => {
    const rows: CashImportRowRow[] = [
      row({ id: "opening", provisional_classification: "opening_cash" }),
      autoIncludedRow({ id: "r1", disposition_reason: null }),
    ];

    const summary = summarizeCashImportBatchDecisions(batch({}), rows, [], false);

    // A manually-decided row is still genuinely included in the committed
    // outcome, even though its provenance can't be reconstructed from
    // disposition_reason — includedRows must not depend on that text.
    expect(summary.includedRows).toBe(1);
    expect(summary.autoDecidedRows).toBe(0);
  });

  it("reports zero blockers for a committed batch once the caller passes hasOpeningBalanceConflict=false", () => {
    const rows: CashImportRowRow[] = [
      row({ id: "opening", provisional_classification: "opening_cash" }),
      autoIncludedRow({ id: "r1" }),
    ];

    const summary = summarizeCashImportBatchDecisions(
      batch({ workbook_closing_balance: 1_000_000, calculated_closing_balance: 1_000_000 }),
      rows,
      [],
      false,
    );

    expect(summary.blockedRows).toBe(0);
  });

  it("never counts the opening balance row as a decision row", () => {
    const rows: CashImportRowRow[] = [row({ id: "opening", provisional_classification: "opening_cash" })];
    const summary = summarizeCashImportBatchDecisions(batch({}), rows, [], false);

    expect(summary.totalRows).toBe(1);
    expect(summary.includedRows).toBe(0);
    expect(summary.autoDecidedRows).toBe(0);
    expect(summary.manualReviewRows).toBe(0);
  });
});
