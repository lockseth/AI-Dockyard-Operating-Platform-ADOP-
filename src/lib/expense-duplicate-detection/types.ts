import type { Enums } from "@/types/database";

export type ExpenseDuplicateReasonCode = Enums<"expense_duplicate_reason_code">;
export type ExpenseDuplicateCandidateStatus = Enums<"expense_duplicate_candidate_status">;

export const EXPENSE_DUPLICATE_REASON_CODES: ExpenseDuplicateReasonCode[] = [
  "reference_match",
  "exact_financial_match",
  "cross_project_reference_match",
  "same_day_amount_vendor_match",
];

export const EXPENSE_DUPLICATE_CANDIDATE_STATUSES: ExpenseDuplicateCandidateStatus[] = [
  "pending",
  "not_duplicate",
  "confirmed_duplicate",
];
