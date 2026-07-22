import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_SHARED_OVERHEAD_ALLOCATION_ERROR = "Gagal memproses alokasi biaya bersama/overhead. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23514, 42501); the RPCs'
// `raise exception` messages report under the generic P0001 code — matched
// by fixed, internally-controlled message text (never by user input), so the
// substring match cannot be spoofed by a caller.
export function mapSharedOverheadAllocationError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_SHARED_OVERHEAD_ALLOCATION_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Entri biaya bersama/overhead atau project tidak ditemukan atau bukan milik tenant Anda.";
    case "23514":
      return "Nominal alokasi harus lebih besar dari nol.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized to allocate")) {
        return "Anda tidak memiliki izin untuk mengalokasikan biaya bersama/overhead.";
      }
      if (error.message?.includes("not authorized to reverse")) {
        return "Anda tidak memiliki izin untuk membatalkan alokasi biaya bersama/overhead.";
      }
      if (error.message?.includes("only an original shared overhead expense can be allocated")) {
        return "Hanya entri biaya bersama/overhead asli yang dapat dialokasikan.";
      }
      if (error.message?.includes("cannot allocate a reversed shared overhead entry")) {
        return "Entri biaya bersama/overhead ini sudah dibatalkan (reversal) dan tidak dapat dialokasikan.";
      }
      if (error.message?.includes("vessel project not found")) {
        return "Project Kapal tidak ditemukan.";
      }
      if (error.message?.includes("cannot allocate shared overhead to a closed vessel project")) {
        return "Project Kapal ini sudah closed dan tidak dapat menerima alokasi biaya bersama/overhead baru.";
      }
      if (error.message?.includes("allocation amount must be greater than zero")) {
        return "Nominal alokasi harus lebih besar dari nol.";
      }
      if (error.message?.includes("allocation exceeds shared overhead entry amount")) {
        return "Total alokasi melebihi nominal entri biaya bersama/overhead.";
      }
      if (error.message?.includes("only an original allocation can be reversed")) {
        return "Hanya alokasi asli yang dapat dibatalkan, bukan pembatalan lain.";
      }
      if (error.message?.includes("already reversed")) {
        return "Alokasi ini sudah pernah dibatalkan sebelumnya.";
      }
      if (error.message?.includes("reversal reason is required")) {
        return "Alasan pembatalan alokasi wajib diisi.";
      }
      if (error.message?.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_SHARED_OVERHEAD_ALLOCATION_ERROR;
    default:
      return GENERIC_SHARED_OVERHEAD_ALLOCATION_ERROR;
  }
}
