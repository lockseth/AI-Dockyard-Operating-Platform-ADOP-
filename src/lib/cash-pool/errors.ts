import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_CASH_POOL_ERROR = "Gagal memproses shared daily cash pool. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23514, 42501); the RPCs'
// `raise exception` messages report under the generic P0001 code — matched
// by fixed, internally-controlled message text (never by user input), so the
// substring match cannot be spoofed by a caller.
export function mapCashPoolError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_CASH_POOL_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Cash pool atau entri terkait tidak ditemukan atau bukan milik tenant Anda.";
    case "23514":
      return "Nominal harus lebih besar dari nol.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized")) {
        return "Anda tidak memiliki izin untuk melakukan aksi ini pada shared daily cash pool.";
      }
      if (error.message?.includes("already reversed")) {
        return "Entri ini sudah pernah dikoreksi (reversal) sebelumnya.";
      }
      if (error.message?.includes("only an original entry can be reversed")) {
        return "Hanya entri asli yang dapat dikoreksi (reversal), bukan entri reversal lain.";
      }
      if (error.message?.includes("reversal reason is required")) {
        return "Alasan koreksi (reversal) wajib diisi.";
      }
      if (error.message?.includes("amount must be greater than zero")) {
        return "Nominal harus lebih besar dari nol.";
      }
      if (error.message?.includes("pool not found") || error.message?.includes("entry not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_CASH_POOL_ERROR;
    default:
      return GENERIC_CASH_POOL_ERROR;
  }
}
