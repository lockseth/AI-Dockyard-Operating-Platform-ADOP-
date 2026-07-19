import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_CASH_RECONCILIATION_ERROR = "Gagal memproses rekonsiliasi kas akhir hari. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23505, 23514, 42501);
// the RPCs' `raise exception` messages report under the generic P0001 code —
// matched by fixed, internally-controlled message text (never by user
// input), so the substring match cannot be spoofed by a caller.
export function mapCashReconciliationError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_CASH_RECONCILIATION_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Cash pool atau rekonsiliasi terkait tidak ditemukan atau bukan milik tenant Anda.";
    case "23505":
      return "Sudah ada rekonsiliasi aktif untuk cash pool ini.";
    case "23514":
      return "Nominal kas fisik tidak boleh negatif.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized to create")) {
        return "Anda tidak memiliki izin untuk membuat rekonsiliasi kas.";
      }
      if (error.message?.includes("not authorized to revise")) {
        return "Anda tidak memiliki izin untuk merevisi rekonsiliasi kas.";
      }
      if (error.message?.includes("not authorized to submit")) {
        return "Anda tidak memiliki izin untuk mengirim rekonsiliasi kas untuk review.";
      }
      if (error.message?.includes("not authorized to review")) {
        return "Hanya owner yang dapat mereview (approve/reject/minta koreksi) rekonsiliasi kas.";
      }
      if (error.message?.includes("not authorized to reopen")) {
        return "Hanya owner yang dapat membuka kembali cash pool yang sudah closed.";
      }
      if (error.message?.includes("cash pool is not open for a new reconciliation")) {
        return "Cash pool ini sedang pending close atau sudah closed — tidak bisa membuat rekonsiliasi baru.";
      }
      if (error.message?.includes("cash pool is not open for reconciliation revision")) {
        return "Cash pool ini tidak sedang open — revisi tidak dapat dilakukan.";
      }
      if (error.message?.includes("cash pool is not open for reconciliation submission")) {
        return "Cash pool ini tidak sedang open — submission tidak dapat dilakukan.";
      }
      if (error.message?.includes("cash pool is not open for new financial entries")) {
        return "Cash pool ini sedang pending close atau sudah closed — transaksi baru ditolak.";
      }
      if (error.message?.includes("cash pool is not pending close")) {
        return "Cash pool ini tidak sedang menunggu penutupan.";
      }
      if (error.message?.includes("cash pool is not closed")) {
        return "Cash pool ini belum closed — tidak dapat dibuka kembali.";
      }
      if (error.message?.includes("cash reconciliation cannot be revised in its current status")) {
        return "Rekonsiliasi ini tidak dapat direvisi pada status saat ini.";
      }
      if (error.message?.includes("cash reconciliation cannot be submitted from its current status")) {
        return "Rekonsiliasi ini tidak dapat dikirim untuk review pada status saat ini.";
      }
      if (error.message?.includes("requires a new revision before resubmission")) {
        return "Rekonsiliasi yang perlu koreksi wajib direvisi terlebih dahulu sebelum dikirim ulang.";
      }
      if (error.message?.includes("is not awaiting review")) {
        return "Rekonsiliasi ini tidak sedang menunggu review — mungkin sudah diproses sebelumnya.";
      }
      if (error.message?.includes("actual counted cash must not be negative")) {
        return "Nominal kas fisik tidak boleh negatif.";
      }
      if (error.message?.includes("explanation is required when variance is non-zero")) {
        return "Selisih (variance) tidak nol — catatan/penjelasan wajib diisi.";
      }
      if (error.message?.includes("rejection reason is required")) {
        return "Alasan penolakan wajib diisi.";
      }
      if (error.message?.includes("correction reason is required")) {
        return "Alasan koreksi wajib diisi.";
      }
      if (error.message?.includes("reopen reason is required")) {
        return "Alasan pembukaan kembali wajib diisi.";
      }
      if (error.message?.includes("status unchanged")) {
        return "Status rekonsiliasi tidak berubah.";
      }
      if (error.message?.includes("invalid cash reconciliation status transition")) {
        return "Transisi status rekonsiliasi tidak valid.";
      }
      if (error.message?.includes("invalid cash pool daily close status transition")) {
        return "Transisi status penutupan cash pool tidak valid.";
      }
      if (error.message === "RECONCILIATION_STALE") {
        return "Data keuangan cash pool berubah sejak rekonsiliasi ini disubmit. Buat revisi baru dan submit ulang.";
      }
      if (error.message?.includes("no active approved reconciliation found to supersede")) {
        return "Tidak ditemukan rekonsiliasi approved aktif untuk cash pool ini.";
      }
      if (error.message?.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_CASH_RECONCILIATION_ERROR;
    default:
      return GENERIC_CASH_RECONCILIATION_ERROR;
  }
}
