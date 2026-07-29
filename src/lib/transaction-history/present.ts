import { formatRupiah } from "@/lib/operations-daily/format";
import type { TrustedTransactionRow } from "./types";

// Plain-language sentence for Pak Hanafi (task LOCK example: "Kas bertambah
// Rp5.000.000 dan biaya Project Kapal KM Nusantara berkurang Rp5.000.000")
// — one clause per nonzero effect column, never per physical ledger row, so
// a paired refund's amount is never described twice.
export function buildEffectClauses(transaction: TrustedTransactionRow): string[] {
  const clauses: string[] = [];
  if (transaction.signed_cash_effect) {
    clauses.push(
      `Kas ${transaction.signed_cash_effect > 0 ? "bertambah" : "berkurang"} ${formatRupiah(
        Math.abs(transaction.signed_cash_effect),
      )}`,
    );
  }
  if (transaction.signed_project_cost_effect) {
    clauses.push(
      `biaya Project Kapal ${transaction.vessel_name ?? transaction.project_code ?? "-"} ${
        transaction.signed_project_cost_effect > 0 ? "bertambah" : "berkurang"
      } ${formatRupiah(Math.abs(transaction.signed_project_cost_effect))}`,
    );
  }
  if (transaction.signed_shared_overhead_effect) {
    clauses.push(
      `biaya overhead bersama ${transaction.signed_shared_overhead_effect > 0 ? "bertambah" : "berkurang"} ${formatRupiah(
        Math.abs(transaction.signed_shared_overhead_effect),
      )}`,
    );
  }
  return clauses;
}

// Canonical Project/Overhead column resolver — the single source every
// Riwayat Transaksi surface (list, today's-transactions, detail) must call
// instead of re-deriving its own vessel_name-is-null fallback. Gate 6I-C: a
// null vessel_name is NOT always Shared Overhead — the opening-balance
// row/reversal (transaction_type 'opening_cash'/'opening_cash_reversal')
// also carries a null vessel_name, and mislabeling it Shared Overhead
// misrepresents a Rp0-overhead batch as having overhead. Only a project-less
// row that is NOT an opening-balance movement is genuinely Shared Overhead.
export function resolveProjectOverheadLabel(
  transaction: Pick<TrustedTransactionRow, "vessel_name" | "project_code" | "transaction_type">,
  sharedOverheadLabel = "Shared Overhead",
): string {
  if (transaction.vessel_name) {
    return transaction.project_code ? `${transaction.vessel_name} (${transaction.project_code})` : transaction.vessel_name;
  }
  if (transaction.transaction_type === "opening_cash" || transaction.transaction_type === "opening_cash_reversal") {
    return "Saldo Awal / Rekonsiliasi";
  }
  return sharedOverheadLabel;
}

export interface SignedAmountPresentation {
  text: string;
  isPositive: boolean;
  isZero: boolean;
}

// Sign must never rely on color alone (task LOCK) — the "+"/"-" prefix in
// `text` is the non-color signal; `isPositive`/`isZero` let a caller choose
// color/emphasis on top of that without re-deriving the sign.
export function formatSignedAmount(value: number | null): SignedAmountPresentation {
  if (value === null || value === 0) {
    return { text: "Rp 0", isPositive: false, isZero: true };
  }
  const isPositive = value > 0;
  return { text: `${isPositive ? "+" : "-"} ${formatRupiah(Math.abs(value))}`, isPositive, isZero: false };
}
