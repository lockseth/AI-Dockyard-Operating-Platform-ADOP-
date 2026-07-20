import type { CashImportBatchRow, CashImportRowRow } from "./repository";

// Pure, UI-facing mirror of approve_and_commit_cash_import_batch's own
// bucket rules (20260720120000_owner_approved_cash_import_commit.sql §6b) —
// lets the Owner Control / batch detail page show "what would happen if you
// approve this" BEFORE the owner actually commits, and explain a skip's
// variance against the raw source. This is cosmetic only: the RPC is the
// sole source of truth for what actually posts, re-validates every one of
// these invariants itself server-side, and never trusts a client-computed
// total.
export interface CanonicalCommitPreview {
  openingCash: number;
  cashTopUpTotal: number;
  projectRefundTotal: number;
  projectExpenseTotal: number;
  sharedOverheadTotal: number;
  netProjectCost: number;
  expectedClosingCash: number;
  skippedDebitTotal: number;
  skippedCreditTotal: number;
  skippedVarianceFromSource: number;
  blockers: CommitBlocker[];
}

export type CommitBlocker =
  | "MAPPING_INCOMPLETE"
  | "DISPOSITION_INCOMPLETE"
  | "MANUAL_REVIEW_UNRESOLVED"
  | "MAPPING_NOT_COMMITTABLE"
  | "VALIDATION_ERRORS_PRESENT"
  | "RECONCILIATION_VARIANCE";

function isIncludableRow(row: CashImportRowRow): boolean {
  return row.provisional_classification !== "opening_cash";
}

export function buildCanonicalCommitPreview(
  batch: CashImportBatchRow,
  rows: CashImportRowRow[],
): CanonicalCommitPreview {
  let cashTopUpTotal = 0;
  let projectRefundTotal = 0;
  let projectExpenseTotal = 0;
  let sharedOverheadTotal = 0;
  let skippedDebitTotal = 0;
  let skippedCreditTotal = 0;

  const blockers = new Set<CommitBlocker>();

  if (batch.error_count > 0) {
    blockers.add("VALIDATION_ERRORS_PRESENT");
  }
  if (batch.workbook_closing_balance === null || batch.workbook_closing_balance !== batch.calculated_closing_balance) {
    blockers.add("RECONCILIATION_VARIANCE");
  }

  for (const row of rows) {
    if (!isIncludableRow(row)) continue;

    if (row.disposition === "manual_review") {
      blockers.add("MANUAL_REVIEW_UNRESOLVED");
      continue;
    }

    if (row.disposition === null || row.mapping_kind === null) {
      blockers.add(row.mapping_kind === null ? "MAPPING_INCOMPLETE" : "DISPOSITION_INCOMPLETE");
      continue;
    }
    if (row.mapping_kind === "existing_vessel_project" && !row.mapped_vessel_project_id) {
      blockers.add("MAPPING_INCOMPLETE");
      continue;
    }

    if (row.disposition === "skip") {
      skippedDebitTotal += row.debit ?? 0;
      skippedCreditTotal += row.credit ?? 0;
      continue;
    }

    // disposition === 'include' from here on.
    if (row.mapping_kind === "new_project_candidate" || row.mapping_kind === "unresolved") {
      blockers.add("MAPPING_NOT_COMMITTABLE");
      continue;
    }

    if (row.mapping_kind === "cash") {
      cashTopUpTotal += row.debit ?? 0;
    } else if (row.mapping_kind === "shared_overhead") {
      sharedOverheadTotal += row.credit ?? 0;
    } else if (row.mapping_kind === "existing_vessel_project") {
      const debit = row.debit ?? 0;
      const credit = row.credit ?? 0;
      if (debit > 0 && credit <= 0) {
        projectRefundTotal += debit;
      } else if (credit > 0 && debit <= 0) {
        projectExpenseTotal += credit;
      }
    }
  }

  const openingCash = batch.opening_balance > 0 ? batch.opening_balance : 0;
  const netProjectCost = projectExpenseTotal - projectRefundTotal;
  const expectedClosingCash = openingCash + cashTopUpTotal + projectRefundTotal - projectExpenseTotal - sharedOverheadTotal;

  return {
    openingCash,
    cashTopUpTotal,
    projectRefundTotal,
    projectExpenseTotal,
    sharedOverheadTotal,
    netProjectCost,
    expectedClosingCash,
    skippedDebitTotal,
    skippedCreditTotal,
    skippedVarianceFromSource: skippedDebitTotal - skippedCreditTotal,
    blockers: Array.from(blockers),
  };
}
