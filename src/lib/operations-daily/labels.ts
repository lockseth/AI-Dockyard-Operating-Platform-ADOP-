import type { CashPoolDailyCloseStatus, CashReconciliationStatus } from "@/lib/cash-reconciliation/types";
import type { ExpenseSubmissionStatus } from "@/lib/expense-approvals/types";

// LOCK — labels from the Gate 1H task spec. Keep in sync with the
// expense_submission_status enum; a missing case is a bug, not a fallback.
const EXPENSE_SUBMISSION_STATUS_LABELS: Record<ExpenseSubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Menunggu Pak Hanafi",
  needs_correction: "Perlu Diperbaiki",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};

export function getExpenseSubmissionStatusLabel(status: ExpenseSubmissionStatus): string {
  return EXPENSE_SUBMISSION_STATUS_LABELS[status];
}

const CASH_POOL_DAILY_CLOSE_STATUS_LABELS: Record<CashPoolDailyCloseStatus, string> = {
  open: "Open",
  pending_close: "Menunggu Penutupan",
  closed: "Sudah Ditutup",
};

export function getCashPoolDailyCloseStatusLabel(status: CashPoolDailyCloseStatus | null): string {
  if (!status) {
    return "Belum Dibuat";
  }
  return CASH_POOL_DAILY_CLOSE_STATUS_LABELS[status];
}

const CASH_RECONCILIATION_STATUS_LABELS: Record<CashReconciliationStatus, string> = {
  draft: "Draft",
  submitted: "Menunggu Review Pak Hanafi",
  needs_correction: "Perlu Diperbaiki",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export function getCashReconciliationStatusLabel(status: CashReconciliationStatus | null): string {
  if (!status) {
    return "Belum Dibuat";
  }
  return CASH_RECONCILIATION_STATUS_LABELS[status];
}
