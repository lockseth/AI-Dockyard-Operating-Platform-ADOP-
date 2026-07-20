import type { ExpenseDuplicateReasonCode } from "@/lib/expense-duplicate-detection/types";

// LOCK — reason labels from the Gate 1I task spec. Keep in sync with the
// expense_duplicate_reason_code enum; a missing case is a bug, not a
// fallback.
const EXPENSE_DUPLICATE_REASON_LABELS: Record<ExpenseDuplicateReasonCode, string> = {
  reference_match: "Nomor referensi sama",
  exact_financial_match: "Data biaya sama",
  cross_project_reference_match: "Referensi sama pada kapal berbeda",
  same_day_amount_vendor_match: "Tanggal, nominal, dan vendor sama",
};

export function getExpenseDuplicateReasonLabel(code: ExpenseDuplicateReasonCode): string {
  return EXPENSE_DUPLICATE_REASON_LABELS[code];
}
