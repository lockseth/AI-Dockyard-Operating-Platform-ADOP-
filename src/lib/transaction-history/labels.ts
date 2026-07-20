// Operational Indonesian labels for Pak Hanafi — never expose the raw
// enum-ish text values from the view directly in the UI.

export const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  opening_cash: "Saldo Awal",
  cash_top_up: "Setor Kas",
  other_cash_in: "Kas Masuk Lain",
  project_expense: "Biaya Project Kapal",
  shared_overhead_expense: "Biaya Overhead Bersama",
  project_refund: "Pengembalian/Refund Project",
  opening_cash_reversal: "Pembatalan Saldo Awal",
  cash_top_up_reversal: "Pembatalan Setor Kas",
  other_cash_in_reversal: "Pembatalan Kas Masuk Lain",
  project_expense_reversal: "Pembatalan Biaya Project Kapal",
  shared_overhead_expense_reversal: "Pembatalan Biaya Overhead Bersama",
  project_refund_reversal: "Pembatalan Refund Project",
};

export const TRANSACTION_DIRECTION_LABEL: Record<string, string> = {
  cash_in: "Kas Masuk",
  cash_out: "Kas Keluar",
  cost_increase: "Biaya Bertambah",
  cost_reduction: "Biaya Berkurang",
  reversal: "Pembatalan",
};

export const TRANSACTION_SOURCE_LABEL: Record<string, string> = {
  direct_manual: "Input Langsung",
  import: "Import",
  reversal: "Reversal",
};

export const TRANSACTION_STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  reversed: "Sudah Dibatalkan",
  reversal: "Transaksi Pembatal",
  partially_reversed: "Reversal Tidak Lengkap",
};

// Gate 1K.1: shown only for the 'partially_reversed' integrity exception —
// only one leg of a paired project refund has been reversed. This is never
// produced by any mutation path after Gate 1K.1 (the database rejects it
// structurally); it can only surface a pre-existing inconsistency, and is
// never auto-repaired.
export const PARTIALLY_REVERSED_EXPLANATION =
  "Hanya satu sisi transaksi refund yang telah direversal. Transaksi memerlukan pemeriksaan Owner.";

export function labelOrRaw(map: Record<string, string>, value: string | null): string {
  if (!value) return "-";
  return map[value] ?? value;
}
