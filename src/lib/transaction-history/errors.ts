import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_TRUSTED_TRANSACTION_HISTORY_ERROR = "Gagal memuat riwayat transaksi. Silakan coba lagi.";

// Every RPC in 20260720140000_trusted_transaction_history.sql raises a
// fixed, internally-controlled message under the generic P0001 code —
// matched here by stable substring, mirroring cash-import-staging/errors.ts.
export function mapTrustedTransactionHistoryError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_TRUSTED_TRANSACTION_HISTORY_ERROR;
  }

  switch (error.code) {
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("not authorized to view trusted transaction history")) {
        return "Hanya Owner dan Admin yang dapat melihat Riwayat Transaksi.";
      }
      return GENERIC_TRUSTED_TRANSACTION_HISTORY_ERROR;
    }
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    default:
      return GENERIC_TRUSTED_TRANSACTION_HISTORY_ERROR;
  }
}
