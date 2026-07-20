export type CashImportRowStatus = "valid" | "warning" | "error";

export type ProvisionalClassification =
  | "opening_cash"
  | "cash_top_up_candidate"
  | "project_cash_in_or_refund_review"
  | "project_expense_candidate"
  | "unallocated_expense_review"
  | "manual_mapping_required";

export type CashImportIssueCode =
  | "FORMULA_RESULT_MISSING"
  | "WORKBOOK_BALANCE_MISSING"
  | "BOTH_DEBIT_AND_CREDIT"
  | "AMOUNT_MISSING"
  | "NEGATIVE_AMOUNT"
  | "INVALID_AMOUNT"
  | "BALANCE_MISMATCH"
  | "DUPLICATE_ROW_CANDIDATE"
  | "AMBIGUOUS_CLASSIFICATION";

export interface CashImportValidationIssue {
  code: CashImportIssueCode;
  severity: "error" | "warning";
  message: string;
}

export interface CashImportPreviewRow {
  source_row_number: number;
  business_date: string | null;
  description: string | null;
  vessel_label: string | null;
  debit: number | null;
  credit: number | null;
  workbook_balance: number | null;
  calculated_balance: number | null;
  provisional_classification: ProvisionalClassification;
  validation_issues: CashImportValidationIssue[];
  source_fingerprint: string;
  status: CashImportRowStatus;
}

export type CashImportFileErrorCode =
  | "WRONG_FORMAT"
  | "UNREADABLE_FILE"
  | "NO_SHEET_FOUND"
  | "MISSING_HEADER"
  | "EMPTY_WORKBOOK"
  | "INVALID_STRUCTURE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_ROWS";

export interface CashImportFileError {
  code: CashImportFileErrorCode;
  message: string;
}

export interface CashImportFileIdentity {
  fileName: string;
  fileSizeBytes: number;
  fileSha256: string;
  sheetNames: string[];
  sheetUsed: string;
}

export interface CashImportSummary {
  openingBalance: number | null;
  totalDebit: number;
  totalCredit: number;
  calculatedClosingBalance: number | null;
  workbookReportedClosingBalance: number | null;
  closingVariance: number | null;
  validRowCount: number;
  warningRowCount: number;
  errorRowCount: number;
  ignoredBlankRowCount: number;
  totalRowDetected: boolean;
  totalRowNumber: number | null;
  manualMappingRequiredCount: number;
  uniqueVesselLabels: string[];
}

export interface CashImportAnalysis {
  identity: CashImportFileIdentity;
  summary: CashImportSummary;
  rows: CashImportPreviewRow[];
  isDryRun: true;
}

export type CashImportParseResult =
  | { ok: true; analysis: CashImportAnalysis }
  | { ok: false; fileError: CashImportFileError };

// Action-layer result: same as the parser's result, plus a distinct
// "forbidden" case for the server-side role re-check — kept separate from
// CashImportFileErrorCode so an authorization failure can never be
// mistaken for (or silently mapped onto) a file-content problem.
export type CashImportActionResult =
  | { ok: true; analysis: CashImportAnalysis }
  | { ok: false; fileError: CashImportFileError }
  | { ok: false; forbidden: true };
