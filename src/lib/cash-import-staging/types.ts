import type { Database } from "@/types/database";
import type { CashImportPreviewRow } from "@/lib/cash-import/types";

export type CashImportBatchStatus = Database["public"]["Enums"]["cash_import_batch_status"];
export type CashImportMappingKind = Database["public"]["Enums"]["cash_import_mapping_kind"];
export type CashImportRowDisposition = Database["public"]["Enums"]["cash_import_row_disposition"];

// The exact shape public.create_cash_import_batch's jsonb_to_recordset call
// expects per row — a projection of the Gate 1J-A parser's own
// CashImportPreviewRow (business_date is dropped: the batch already carries
// one business_date, and RPC recomputes every aggregate from these fields
// itself rather than trusting a caller-supplied total).
export interface CashImportBatchRpcRow {
  source_row_number: number;
  source_fingerprint: string;
  description: string | null;
  vessel_label: string | null;
  debit: number | null;
  credit: number | null;
  workbook_balance: number | null;
  calculated_balance: number | null;
  provisional_classification: CashImportPreviewRow["provisional_classification"];
  status: CashImportPreviewRow["status"];
  validation_issues: CashImportPreviewRow["validation_issues"];
}

export function toBatchRpcRow(row: CashImportPreviewRow): CashImportBatchRpcRow {
  return {
    source_row_number: row.source_row_number,
    source_fingerprint: row.source_fingerprint,
    description: row.description,
    vessel_label: row.vessel_label,
    debit: row.debit,
    credit: row.credit,
    workbook_balance: row.workbook_balance,
    calculated_balance: row.calculated_balance,
    provisional_classification: row.provisional_classification,
    status: row.status,
    validation_issues: row.validation_issues,
  };
}
