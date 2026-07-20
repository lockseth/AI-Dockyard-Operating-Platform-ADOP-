import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { EXPECTED_HEADERS, KAS_LABEL, MAX_FILE_SIZE_BYTES, MAX_ROWS, OVERHEAD_LABEL } from "./constants";
import type {
  CashImportAnalysis,
  CashImportFileErrorCode,
  CashImportFileIdentity,
  CashImportParseResult,
  CashImportPreviewRow,
  CashImportValidationIssue,
  ProvisionalClassification,
} from "./types";

function fail(code: CashImportFileErrorCode, message: string): CashImportParseResult {
  return { ok: false, fileError: { code, message } };
}

function normalizeHeaderCell(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function cellAt(sheet: XLSX.WorkSheet, row: number, col: number): XLSX.CellObject | undefined {
  return sheet[XLSX.utils.encode_cell({ r: row, c: col })];
}

function textOf(cell: XLSX.CellObject | undefined): string | null {
  if (!cell || typeof cell.v !== "string") {
    return null;
  }
  const trimmed = cell.v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isSumFormula(cell: XLSX.CellObject | undefined): boolean {
  return typeof cell?.f === "string" && /^SUM\(/i.test(cell.f.trim());
}

interface AmountReading {
  attempted: boolean;
  value: number | null;
  issues: CashImportValidationIssue[];
}

// A cell "counts" as an amount attempt only if it holds a formula or a
// numeric literal — text, blanks, and #REF!-style errors are not attempts,
// they just make the row shape ambiguous like any other missing value.
function readAmount(cell: XLSX.CellObject | undefined): AmountReading {
  if (!cell) {
    return { attempted: false, value: null, issues: [] };
  }

  const hasFormula = typeof cell.f === "string";
  const rawIsNumber = typeof cell.v === "number";

  if (!hasFormula && !rawIsNumber) {
    return { attempted: false, value: null, issues: [] };
  }

  if (!rawIsNumber) {
    return {
      attempted: true,
      value: null,
      issues: [
        {
          code: "FORMULA_RESULT_MISSING",
          severity: "error",
          message: "Formula tidak memiliki cached result yang dapat dipercaya.",
        },
      ],
    };
  }

  const value = cell.v as number;
  if (!Number.isFinite(value)) {
    return {
      attempted: true,
      value: null,
      issues: [{ code: "INVALID_AMOUNT", severity: "error", message: "Nilai nominal tidak valid (NaN/Infinity)." }],
    };
  }

  if (value < 0) {
    return {
      attempted: true,
      value,
      issues: [{ code: "NEGATIVE_AMOUNT", severity: "error", message: "Nominal negatif tidak diperbolehkan." }],
    };
  }

  return { attempted: true, value, issues: [] };
}

function classify(vesselLabel: string | null, field: "debit" | "credit"): {
  classification: ProvisionalClassification;
  ambiguous: boolean;
} {
  if (field === "debit") {
    if (vesselLabel === KAS_LABEL) {
      return { classification: "cash_top_up_candidate", ambiguous: false };
    }
    if (vesselLabel) {
      return { classification: "project_cash_in_or_refund_review", ambiguous: false };
    }
    return { classification: "manual_mapping_required", ambiguous: true };
  }

  if (vesselLabel === OVERHEAD_LABEL) {
    return { classification: "unallocated_expense_review", ambiguous: false };
  }
  if (vesselLabel && vesselLabel !== KAS_LABEL) {
    return { classification: "project_expense_candidate", ambiguous: false };
  }
  return { classification: "manual_mapping_required", ambiguous: true };
}

function excelSerialToIsoDate(serial: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) {
    return null;
  }
  const y = String(parsed.y).padStart(4, "0");
  const m = String(parsed.m).padStart(2, "0");
  const d = String(parsed.d).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fingerprintOf(parts: Array<string | number | null>): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("|")).digest("hex");
}

function statusOf(issues: CashImportValidationIssue[]): "valid" | "warning" | "error" {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "valid";
}

// Pure worksheet-level parser — no file/buffer concerns. Kept separate from
// parseCashReportWorkbook() so tests can hand-build a WorkSheet (e.g. a
// formula cell with no cached value) without depending on whether the xlsx
// writer round-trips that exact shape through a real binary file.
export function parseCashReportSheet(sheet: XLSX.WorkSheet, identity: CashImportFileIdentity): CashImportParseResult {
  const ref = sheet["!ref"];
  if (!ref) {
    return fail("EMPTY_WORKBOOK", "Sheet tidak memiliki data.");
  }

  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  if (rowCount > MAX_ROWS) {
    return fail("TOO_MANY_ROWS", `Jumlah baris melebihi batas ${MAX_ROWS}.`);
  }

  const headerRow = range.s.r;
  const foundHeaders = EXPECTED_HEADERS.map((_, col) => normalizeHeaderCell(cellAt(sheet, headerRow, col)?.v));
  const headerMatches = EXPECTED_HEADERS.every((expected, i) => foundHeaders[i] === expected);
  if (!headerMatches) {
    return fail(
      "MISSING_HEADER",
      `Header tidak sesuai kontrak. Diharapkan: ${EXPECTED_HEADERS.join(", ")}. Ditemukan: ${foundHeaders.join(", ")}.`,
    );
  }

  const openingRowIndex = headerRow + 1;
  if (openingRowIndex > range.e.r) {
    return fail("EMPTY_WORKBOOK", "Workbook hanya memiliki header, tidak ada data.");
  }

  const dateCell = cellAt(sheet, openingRowIndex, 0);
  const openingCell = cellAt(sheet, openingRowIndex, 5);
  const businessDate = typeof dateCell?.v === "number" ? excelSerialToIsoDate(dateCell.v) : null;
  const openingBalance = typeof openingCell?.v === "number" ? openingCell.v : null;

  if (businessDate === null || openingBalance === null) {
    return fail(
      "INVALID_STRUCTURE",
      "Row 2 wajib memiliki tanggal laporan (kolom TANGGAL) dan opening balance (kolom SALDO).",
    );
  }

  const rows: CashImportPreviewRow[] = [];
  const openingFingerprint = fingerprintOf(["opening", businessDate, openingBalance]);
  rows.push({
    source_row_number: openingRowIndex + 1,
    business_date: businessDate,
    description: null,
    vessel_label: null,
    debit: null,
    credit: null,
    workbook_balance: openingBalance,
    calculated_balance: openingBalance,
    provisional_classification: "opening_cash",
    validation_issues: [],
    source_fingerprint: openingFingerprint,
    status: "valid",
  });

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;
  let ignoredBlankRowCount = 0;
  let totalRowDetected = false;
  let totalRowNumber: number | null = null;
  const uniqueVesselLabels = new Set<string>();

  for (let r = openingRowIndex + 1; r <= range.e.r; r++) {
    const debitCell = cellAt(sheet, r, 3);
    const creditCell = cellAt(sheet, r, 4);

    if (isSumFormula(debitCell) || isSumFormula(creditCell)) {
      totalRowDetected = true;
      totalRowNumber = r + 1;
      continue;
    }

    const description = textOf(cellAt(sheet, r, 1));
    const vesselLabel = textOf(cellAt(sheet, r, 2));
    const debitReading = readAmount(debitCell);
    const creditReading = readAmount(creditCell);
    const hasLabel = description !== null || vesselLabel !== null;

    if (!hasLabel && !debitReading.attempted && !creditReading.attempted) {
      ignoredBlankRowCount++;
      continue;
    }

    const issues: CashImportValidationIssue[] = [...debitReading.issues, ...creditReading.issues];
    let classification: ProvisionalClassification = "manual_mapping_required";
    let calculatedBalance = runningBalance;
    const debitValue: number | null = debitReading.value;
    const creditValue: number | null = creditReading.value;
    let workbookBalance: number | null = null;

    if (debitReading.attempted && creditReading.attempted) {
      issues.push({
        code: "BOTH_DEBIT_AND_CREDIT",
        severity: "error",
        message: "Baris memiliki nilai debit dan kredit sekaligus.",
      });
    } else if (!debitReading.attempted && !creditReading.attempted) {
      issues.push({ code: "AMOUNT_MISSING", severity: "error", message: "Baris tidak memiliki nominal." });
    } else if (issues.length === 0) {
      const field: "debit" | "credit" = debitReading.attempted ? "debit" : "credit";
      const amount = field === "debit" ? debitValue! : creditValue!;
      runningBalance = runningBalance + (field === "debit" ? amount : -amount);
      calculatedBalance = runningBalance;
      if (field === "debit") totalDebit += amount;
      else totalCredit += amount;

      const result = classify(vesselLabel, field);
      classification = result.classification;
      if (result.ambiguous) {
        issues.push({
          code: "AMBIGUOUS_CLASSIFICATION",
          severity: "warning",
          message: "Kombinasi label/nominal tidak dapat diklasifikasi otomatis — perlu mapping manual.",
        });
      }

      const saldoCell = cellAt(sheet, r, 5);
      if (typeof saldoCell?.v === "number") {
        workbookBalance = saldoCell.v;
        if (workbookBalance !== calculatedBalance) {
          issues.push({
            code: "BALANCE_MISMATCH",
            severity: "error",
            message: `Saldo workbook (${workbookBalance}) tidak cocok dengan hasil perhitungan ulang (${calculatedBalance}).`,
          });
        }
      } else if (typeof saldoCell?.f === "string") {
        issues.push({
          code: "WORKBOOK_BALANCE_MISSING",
          severity: "warning",
          message: "Formula SALDO tidak memiliki cached result untuk dibandingkan.",
        });
      }

      if (vesselLabel) {
        uniqueVesselLabels.add(vesselLabel);
      }
    }
    // If debit/credit each individually had issues (formula missing, invalid,
    // negative) but only one side was attempted, those issues already
    // populate `issues` above and the row is excluded from classification
    // and from the running-balance/sum accumulation.

    rows.push({
      source_row_number: r + 1,
      business_date: businessDate,
      description,
      vessel_label: vesselLabel,
      debit: debitValue,
      credit: creditValue,
      workbook_balance: workbookBalance,
      calculated_balance: calculatedBalance,
      provisional_classification: classification,
      validation_issues: issues,
      source_fingerprint: fingerprintOf([businessDate, description, vesselLabel, debitValue, creditValue]),
      status: statusOf(issues),
    });
  }

  // Duplicate detection: exact-fingerprint collisions among transaction rows
  // (never the opening row, which is expected to be unique by construction).
  const fingerprintCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.provisional_classification === "opening_cash") continue;
    fingerprintCounts.set(row.source_fingerprint, (fingerprintCounts.get(row.source_fingerprint) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.provisional_classification === "opening_cash") continue;
    if ((fingerprintCounts.get(row.source_fingerprint) ?? 0) > 1) {
      row.validation_issues.push({
        code: "DUPLICATE_ROW_CANDIDATE",
        severity: "warning",
        message: "Baris ini memiliki fingerprint identik dengan baris lain — kandidat duplikat, wajib human review.",
      });
      row.status = statusOf(row.validation_issues);
    }
  }

  const nonOpeningRows = rows.slice(1);
  const validRowCount = nonOpeningRows.filter((r) => r.status === "valid").length;
  const warningRowCount = nonOpeningRows.filter((r) => r.status === "warning").length;
  const errorRowCount = nonOpeningRows.filter((r) => r.status === "error").length;
  const manualMappingRequiredCount = nonOpeningRows.filter(
    (r) => r.provisional_classification === "manual_mapping_required",
  ).length;

  let workbookReportedClosingBalance: number | null = null;
  if (totalRowDetected && totalRowNumber !== null) {
    const totalSaldoCell = cellAt(sheet, totalRowNumber - 1, 5);
    workbookReportedClosingBalance = typeof totalSaldoCell?.v === "number" ? totalSaldoCell.v : null;
  } else {
    const lastWithBalance = [...nonOpeningRows].reverse().find((r) => r.workbook_balance !== null);
    workbookReportedClosingBalance = lastWithBalance?.workbook_balance ?? null;
  }

  const calculatedClosingBalance = runningBalance;
  const closingVariance =
    workbookReportedClosingBalance !== null ? calculatedClosingBalance - workbookReportedClosingBalance : null;

  const analysis: CashImportAnalysis = {
    identity,
    summary: {
      openingBalance,
      totalDebit,
      totalCredit,
      calculatedClosingBalance,
      workbookReportedClosingBalance,
      closingVariance,
      validRowCount,
      warningRowCount,
      errorRowCount,
      ignoredBlankRowCount,
      totalRowDetected,
      totalRowNumber,
      manualMappingRequiredCount,
      uniqueVesselLabels: [...uniqueVesselLabels].sort(),
    },
    rows,
    isDryRun: true,
  };

  return { ok: true, analysis };
}

// Buffer/file-level boundary: format, size, and row-count gates, then
// delegates to the pure sheet parser above. This is the only function that
// touches raw file bytes.
export function parseCashReportWorkbook(buffer: Buffer, fileName: string): CashImportParseResult {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return fail("WRONG_FORMAT", "Hanya file .xlsx yang diterima.");
  }
  if (buffer.byteLength === 0) {
    return fail("EMPTY_WORKBOOK", "File kosong.");
  }
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    return fail("FILE_TOO_LARGE", `Ukuran file melebihi batas ${MAX_FILE_SIZE_BYTES} bytes.`);
  }

  // .xlsx is a ZIP archive — reject anything that isn't one before handing
  // it to the parser at all. SheetJS otherwise falls back to permissive
  // CSV/text sniffing for non-zip content instead of throwing, which would
  // let arbitrary uploaded bytes reach deeper into the parser than an
  // untrusted upload should (CLAUDE.md §9: treat uploads as untrusted).
  const ZIP_SIGNATURES = [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  ];
  const isZip = ZIP_SIGNATURES.some((sig) => buffer.subarray(0, 4).equals(sig));
  if (!isZip) {
    return fail("WRONG_FORMAT", "File bukan .xlsx yang valid (signature ZIP tidak ditemukan).");
  }

  const fileSha256 = createHash("sha256").update(buffer).digest("hex");

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellFormula: true, bookVBA: false });
  } catch {
    return fail("WRONG_FORMAT", "File tidak dapat dibaca sebagai .xlsx yang valid.");
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return fail("NO_SHEET_FOUND", "Workbook tidak memiliki sheet.");
  }

  const sheetUsed = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetUsed];
  if (!sheet) {
    return fail("EMPTY_WORKBOOK", "Sheet tidak memiliki data.");
  }

  return parseCashReportSheet(sheet, {
    fileName,
    fileSizeBytes: buffer.byteLength,
    fileSha256,
    sheetNames: workbook.SheetNames,
    sheetUsed,
  });
}
