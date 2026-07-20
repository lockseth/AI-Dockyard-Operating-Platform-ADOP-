import * as XLSX from "xlsx";
import type { CashImportFileIdentity } from "./types";

export interface CellSpec {
  v?: string | number;
  f?: string;
}

export const HEADER_ROW: Array<CellSpec | null> = [
  { v: "TANGGAL" },
  { v: "KETERANGAN" },
  { v: "NAMA KAPAL" },
  { v: "DEBET" },
  { v: "KREDIT" },
  { v: "SALDO" },
];

// Hand-builds a WorkSheet from a cell matrix instead of going through
// XLSX.write()+XLSX.read() — the real writer drops formula cells that have
// no cached `.v`, which is exactly the FORMULA_RESULT_MISSING shape these
// tests need to construct on purpose.
export function buildSheet(matrix: Array<Array<CellSpec | null>>): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  let maxCol = 0;
  matrix.forEach((row, r) => {
    row.forEach((spec, c) => {
      maxCol = Math.max(maxCol, c);
      if (!spec) return;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = {} as XLSX.CellObject;
      if (spec.f !== undefined) {
        cell.f = spec.f;
      }
      if (spec.v !== undefined) {
        cell.v = spec.v;
        cell.t = typeof spec.v === "number" ? "n" : "s";
      } else if (spec.f !== undefined) {
        cell.t = "n";
      }
      sheet[addr] = cell;
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(matrix.length - 1, 0), c: maxCol },
  });
  return sheet;
}

export function testIdentity(overrides: Partial<CashImportFileIdentity> = {}): CashImportFileIdentity {
  return {
    fileName: "fixture.xlsx",
    fileSizeBytes: 0,
    fileSha256: "test-fingerprint",
    sheetNames: ["Sheet1"],
    sheetUsed: "Sheet1",
    ...overrides,
  };
}

// A real .xlsx binary buffer for tests that exercise the buffer/file-level
// boundary (format, header normalization, hash stability, size limits).
// Every formula cell in these fixtures must carry a cached `.v` — see the
// buildSheet() comment above for why.
export function buildWorkbookBuffer(matrix: Array<Array<CellSpec | null>>, sheetName = "Sheet1"): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = buildSheet(matrix);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Inverse of the parser's excelSerialToIsoDate() (Excel's 1900 date system,
// serial 1 = 1900-01-01, with the epoch anchored one day earlier at
// 1899-12-30 to match Excel's leap-year bug for dates after 1900-03-01,
// which every realistic business date in this dataset is).
export function isoDateToExcelSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const epochMs = Date.UTC(1899, 11, 30);
  const targetMs = Date.UTC(y, m - 1, d);
  return Math.round((targetMs - epochMs) / 86_400_000);
}
