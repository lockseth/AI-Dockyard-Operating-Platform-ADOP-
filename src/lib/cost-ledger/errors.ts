import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_COST_LEDGER_ERROR = "Gagal memproses biaya project. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23514, 42501); the RPCs'
// `raise exception` messages report under the generic P0001 code — matched
// by fixed, internally-controlled message text (never by user input), so the
// substring match cannot be spoofed by a caller.
export function mapCostLedgerError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_COST_LEDGER_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Cash pool, project, kategori, atau vendor tidak ditemukan atau bukan milik tenant Anda.";
    case "23514":
      return "Nominal harus lebih besar dari nol, dan keterangan wajib diisi.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized")) {
        return "Anda tidak memiliki izin untuk melakukan aksi ini pada biaya project.";
      }
      if (error.message?.includes("closed to new expenses")) {
        return "Project sudah closed dan tidak dapat menerima biaya baru.";
      }
      if (error.message?.includes("already reversed")) {
        return "Biaya ini sudah pernah dikoreksi (reversal) sebelumnya.";
      }
      if (error.message?.includes("only an original expense can be reversed")) {
        return "Hanya biaya asli yang dapat dikoreksi (reversal), bukan entri reversal lain.";
      }
      if (error.message?.includes("cannot reverse a reversal")) {
        return "Entri reversal tidak dapat direversal lagi.";
      }
      if (error.message?.includes("reversal reason is required")) {
        return "Alasan koreksi (reversal) wajib diisi.";
      }
      if (error.message?.includes("amount must be greater than zero")) {
        return "Nominal harus lebih besar dari nol.";
      }
      if (error.message?.includes("expense description is required")) {
        return "Keterangan biaya wajib diisi.";
      }
      if (error.message?.includes("must reference an entry in the same")) {
        return "Reversal harus mengacu pada tenant, cash pool, dan project yang sama dengan biaya asli.";
      }
      if (error.message?.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_COST_LEDGER_ERROR;
    default:
      return GENERIC_COST_LEDGER_ERROR;
  }
}
