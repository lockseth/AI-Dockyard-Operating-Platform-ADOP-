import type { Tables } from "@/types/database";

export type TrustedTransactionRow = Tables<"trusted_transaction_history">;

// Mirrors the CASE expressions in 20260720140000_trusted_transaction_history.sql
// — kept here as the single TS-side source of truth for filter/label values
// rather than a DB enum (the view computes these, they are not stored).
export const TRANSACTION_TYPES = [
  "opening_cash",
  "cash_top_up",
  "other_cash_in",
  "project_expense",
  "shared_overhead_expense",
  "project_refund",
  "opening_cash_reversal",
  "cash_top_up_reversal",
  "other_cash_in_reversal",
  "project_expense_reversal",
  "shared_overhead_expense_reversal",
  "project_refund_reversal",
] as const;
export type TrustedTransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_DIRECTIONS = ["cash_in", "cash_out", "cost_increase", "cost_reduction", "reversal"] as const;
export type TrustedTransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

export const TRANSACTION_SOURCES = ["direct_manual", "import", "reversal"] as const;
export type TrustedTransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const TRANSACTION_STATUSES = ["active", "reversed", "reversal"] as const;
export type TrustedTransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface TrustedTransactionCursor {
  businessDate: string;
  createdAt: string;
  logicalTransactionId: string;
}

// Opaque, URL-safe cursor token — the client only ever round-trips this
// string, never the individual seek fields (so it cannot hand-craft a
// forged tuple and it never has to know the seek-column order).
export function encodeTrustedTransactionCursor(cursor: TrustedTransactionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTrustedTransactionCursor(token: string): TrustedTransactionCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).businessDate === "string" &&
      typeof (parsed as Record<string, unknown>).createdAt === "string" &&
      typeof (parsed as Record<string, unknown>).logicalTransactionId === "string"
    ) {
      return parsed as TrustedTransactionCursor;
    }
    return null;
  } catch {
    return null;
  }
}
