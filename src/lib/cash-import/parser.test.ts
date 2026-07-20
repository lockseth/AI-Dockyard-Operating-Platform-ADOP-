import { describe, expect, it } from "vitest";
import { parseCashReportSheet, parseCashReportWorkbook } from "./parser";
import { buildSheet, buildWorkbookBuffer, HEADER_ROW, isoDateToExcelSerial, testIdentity } from "./test-helpers";
import type { CashImportPreviewRow } from "./types";

const OPENING_DATE = "2026-01-05";
const OPENING_SERIAL = isoDateToExcelSerial(OPENING_DATE);

function findRow(rows: CashImportPreviewRow[], sourceRowNumber: number): CashImportPreviewRow {
  const row = rows.find((r) => r.source_row_number === sourceRowNumber);
  if (!row) throw new Error(`row ${sourceRowNumber} not found`);
  return row;
}

describe("parseCashReportWorkbook — file-level boundary", () => {
  it("accepts a valid six-column workbook", () => {
    const buffer = buildWorkbookBuffer([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 100_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 50_000 }, null, { v: 150_000, f: "F2+D3-E3" }],
    ]);
    const result = parseCashReportWorkbook(buffer, "laporan.xlsx");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.summary.openingBalance).toBe(100_000);
    expect(result.analysis.summary.validRowCount).toBe(1);
  });

  it("normalizes header whitespace/case", () => {
    const buffer = buildWorkbookBuffer([
      [{ v: "  tanggal " }, { v: "keterangan" }, { v: "nama kapal" }, { v: "debet" }, { v: "kredit" }, { v: "saldo" }],
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 100_000 }],
    ]);
    const result = parseCashReportWorkbook(buffer, "laporan.xlsx");
    expect(result.ok).toBe(true);
  });

  it("rejects a workbook with a missing/wrong header", () => {
    const buffer = buildWorkbookBuffer([
      [{ v: "TANGGAL" }, { v: "URAIAN" }, { v: "NAMA KAPAL" }, { v: "DEBET" }, { v: "KREDIT" }, { v: "SALDO" }],
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 100_000 }],
    ]);
    const result = parseCashReportWorkbook(buffer, "laporan.xlsx");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("MISSING_HEADER");
  });

  it("rejects a non-xlsx file by extension", () => {
    const result = parseCashReportWorkbook(Buffer.from("not a real workbook"), "laporan.csv");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("WRONG_FORMAT");
  });

  it("rejects a file with .xlsx extension but content that isn't a ZIP archive", () => {
    const garbage = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 11) % 256));
    const result = parseCashReportWorkbook(garbage, "laporan.xlsx");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("WRONG_FORMAT");
  });

  it("rejects plain text content even with an .xlsx extension", () => {
    const result = parseCashReportWorkbook(Buffer.from("this is not a zip/xlsx"), "laporan.xlsx");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("WRONG_FORMAT");
  });

  it("rejects an empty workbook (header only, no data)", () => {
    const buffer = buildWorkbookBuffer([HEADER_ROW]);
    const result = parseCashReportWorkbook(buffer, "laporan.xlsx");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("EMPTY_WORKBOOK");
  });

  it("rejects a zero-byte file", () => {
    const result = parseCashReportWorkbook(Buffer.alloc(0), "laporan.xlsx");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("EMPTY_WORKBOOK");
  });

  it("produces a stable SHA-256 for identical content and a different one for different content", () => {
    const bufferA = buildWorkbookBuffer([HEADER_ROW, [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1000 }]]);
    const bufferB = Buffer.from(bufferA);
    const bufferC = buildWorkbookBuffer([HEADER_ROW, [{ v: OPENING_SERIAL }, null, null, null, null, { v: 2000 }]]);

    const resultA = parseCashReportWorkbook(bufferA, "laporan.xlsx");
    const resultB = parseCashReportWorkbook(bufferB, "laporan.xlsx");
    const resultC = parseCashReportWorkbook(bufferC, "laporan.xlsx");
    if (!resultA.ok || !resultB.ok || !resultC.ok) throw new Error("expected all parses to succeed");

    expect(resultA.analysis.identity.fileSha256).toBe(resultB.analysis.identity.fileSha256);
    expect(resultA.analysis.identity.fileSha256).not.toBe(resultC.analysis.identity.fileSha256);
  });

  it("never logs file content: parser and actions source contain no console.* calls", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    for (const file of ["parser.ts", "actions.ts"]) {
      const source = await fs.readFile(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/console\.(log|error|warn|info|debug)/);
    }
  });
});

describe("parseCashReportSheet — row classification and validation", () => {
  it("detects the opening balance row", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 7_870_794 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.summary.openingBalance).toBe(7_870_794);
    const opening = findRow(result.analysis.rows, 2);
    expect(opening.provisional_classification).toBe("opening_cash");
    expect(opening.calculated_balance).toBe(7_870_794);
  });

  it("parses a literal debit and a literal credit", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Setoran kas" }, { v: "Kas" }, { v: 500_000 }, null, { v: 1_500_000 }],
      [null, { v: "Biaya sertifikasi" }, { v: "Vessel A" }, null, { v: 200_000 }, { v: 1_300_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const debitRow = findRow(result.analysis.rows, 3);
    expect(debitRow.debit).toBe(500_000);
    expect(debitRow.credit).toBeNull();
    expect(debitRow.provisional_classification).toBe("cash_top_up_candidate");

    const creditRow = findRow(result.analysis.rows, 4);
    expect(creditRow.credit).toBe(200_000);
    expect(creditRow.provisional_classification).toBe("project_expense_candidate");
    expect(result.analysis.summary.totalDebit).toBe(500_000);
    expect(result.analysis.summary.totalCredit).toBe(200_000);
  });

  it("parses a cached formula result WITHOUT evaluating the formula text", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      // Formula text says "1+1" but the cached value is 450000 — if the
      // parser ever evaluated the formula instead of trusting the cache,
      // this assertion would fail.
      [null, { v: "Mooring" }, { v: "Vessel B" }, null, { v: 450_000, f: "1+1" }, { v: 550_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.credit).toBe(450_000);
  });

  it("flags a formula with no cached result as FORMULA_RESULT_MISSING", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Mooring" }, { v: "Vessel B" }, null, { f: "9*50000" }, null],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.status).toBe("error");
    expect(row.validation_issues.map((i) => i.code)).toContain("FORMULA_RESULT_MISSING");
    // Not trusted — must not silently advance the running balance.
    expect(row.calculated_balance).toBe(1_000_000);
  });

  it("ignores blank rows that only carry a running-balance formula", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, null, null, null, null, { v: 1_000_000, f: "F2+D3-E3" }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_100_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.summary.ignoredBlankRowCount).toBe(1);
    expect(result.analysis.rows.find((r) => r.source_row_number === 3)).toBeUndefined();
  });

  it("recognizes and excludes the SUM total row", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_100_000 }],
      [null, { v: "Biaya" }, { v: "Vessel A" }, null, { v: 50_000 }, { v: 1_050_000 }],
      [null, null, null, { v: 100_000, f: "SUM(D3:D4)" }, { v: 50_000, f: "SUM(E3:E4)" }, { v: 1_050_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.summary.totalRowDetected).toBe(true);
    expect(result.analysis.summary.totalRowNumber).toBe(5);
    expect(result.analysis.rows.find((r) => r.source_row_number === 5)).toBeUndefined();
    expect(result.analysis.summary.workbookReportedClosingBalance).toBe(1_050_000);
  });

  it("rejects a row with both debit and credit", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Aneh" }, { v: "Vessel A" }, { v: 10_000 }, { v: 5_000 }, { v: 1_005_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.status).toBe("error");
    expect(row.validation_issues.map((i) => i.code)).toContain("BOTH_DEBIT_AND_CREDIT");
  });

  it("rejects a row with a label but no amount", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Lupa isi nominal" }, { v: "Vessel A" }, null, null, null],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.status).toBe("error");
    expect(row.validation_issues.map((i) => i.code)).toContain("AMOUNT_MISSING");
  });

  it("rejects a negative amount", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Salah input" }, { v: "Vessel A" }, { v: -10_000 }, null, { v: 990_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.status).toBe("error");
    expect(row.validation_issues.map((i) => i.code)).toContain("NEGATIVE_AMOUNT");
    expect(row.calculated_balance).toBe(1_000_000);
  });

  it("recalculates the running balance from opening + debit - credit, ignoring the SALDO column as truth", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      // SALDO here is deliberately wrong (should be 1,100,000) to prove the
      // parser doesn't just copy it forward.
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 9_999_999 }],
      [null, { v: "Biaya" }, { v: "Vessel A" }, null, { v: 40_000 }, { v: 1_060_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row2 = findRow(result.analysis.rows, 3);
    expect(row2.calculated_balance).toBe(1_100_000);
    const row3 = findRow(result.analysis.rows, 4);
    expect(row3.calculated_balance).toBe(1_060_000);
    expect(result.analysis.summary.calculatedClosingBalance).toBe(1_060_000);
  });

  it("flags a balance mismatch as an error", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_050_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = findRow(result.analysis.rows, 3);
    expect(row.status).toBe("error");
    expect(row.validation_issues.map((i) => i.code)).toContain("BALANCE_MISMATCH");
  });

  it("flags exact duplicate rows (same date/desc/vessel/amount) as duplicate candidates, still visible", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_100_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_200_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row1 = findRow(result.analysis.rows, 3);
    const row2 = findRow(result.analysis.rows, 4);
    expect(row1.validation_issues.map((i) => i.code)).toContain("DUPLICATE_ROW_CANDIDATE");
    expect(row2.validation_issues.map((i) => i.code)).toContain("DUPLICATE_ROW_CANDIDATE");
    // Duplicates stay visible in the row list, not silently dropped.
    expect(result.analysis.rows.length).toBe(3);
  });

  it("classifies debit/credit combinations per the provisional-classification lock", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 1_000_000 }],
      [null, { v: "Top up" }, { v: "Kas" }, { v: 10_000 }, null, { v: 1_010_000 }],
      [null, { v: "Refund" }, { v: "Vessel A" }, { v: 10_000 }, null, { v: 1_020_000 }],
      [null, { v: "Biaya" }, { v: "Vessel A" }, null, { v: 5_000 }, { v: 1_015_000 }],
      [null, { v: "Overhead" }, { v: "Lain-lain" }, null, { v: 5_000 }, { v: 1_010_000 }],
      [null, { v: "Ambigu" }, null, null, { v: 1_000 }, { v: 1_009_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findRow(result.analysis.rows, 3).provisional_classification).toBe("cash_top_up_candidate");
    expect(findRow(result.analysis.rows, 4).provisional_classification).toBe("project_cash_in_or_refund_review");
    expect(findRow(result.analysis.rows, 5).provisional_classification).toBe("project_expense_candidate");
    expect(findRow(result.analysis.rows, 6).provisional_classification).toBe("unallocated_expense_review");
    const ambiguous = findRow(result.analysis.rows, 7);
    expect(ambiguous.provisional_classification).toBe("manual_mapping_required");
    expect(ambiguous.validation_issues.map((i) => i.code)).toContain("AMBIGUOUS_CLASSIFICATION");
  });

  it("rejects a workbook missing row 2's date/opening balance", () => {
    const sheet = buildSheet([HEADER_ROW, [null, { v: "Setoran" }, { v: "Kas" }, { v: 10_000 }, null, null]]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fileError.code).toBe("INVALID_STRUCTURE");
  });

  it("end-to-end reconciles opening + debit - credit against a synthetic mini cash report", () => {
    const sheet = buildSheet([
      HEADER_ROW,
      [{ v: OPENING_SERIAL }, null, null, null, null, { v: 500_000 }],
      [null, { v: "Setoran" }, { v: "Kas" }, { v: 200_000 }, null, { v: 700_000 }],
      [null, { v: "Biaya A" }, { v: "Vessel A" }, null, { v: 150_000 }, { v: 550_000 }],
      [null, { v: "Biaya B" }, { v: "Vessel B" }, null, { v: 100_000 }, { v: 450_000 }],
      [null, null, null, null, null, { v: 450_000, f: "F5+D6-E6" }],
      [null, null, null, { v: 200_000, f: "SUM(D3:D5)" }, { v: 250_000, f: "SUM(E3:E5)" }, { v: 450_000 }],
    ]);
    const result = parseCashReportSheet(sheet, testIdentity());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { summary } = result.analysis;
    expect(summary.openingBalance).toBe(500_000);
    expect(summary.totalDebit).toBe(200_000);
    expect(summary.totalCredit).toBe(250_000);
    expect(summary.calculatedClosingBalance).toBe(450_000);
    expect(summary.workbookReportedClosingBalance).toBe(450_000);
    expect(summary.closingVariance).toBe(0);
    expect(summary.validRowCount).toBe(3);
    expect(summary.errorRowCount).toBe(0);
    expect(summary.ignoredBlankRowCount).toBe(1);
    expect(summary.totalRowDetected).toBe(true);
  });
});
