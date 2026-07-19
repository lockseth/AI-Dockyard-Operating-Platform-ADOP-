import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_EXPENSE_APPROVAL_ERROR = "Gagal memproses submission biaya. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23514, 42501); the RPCs'
// `raise exception` messages report under the generic P0001 code — matched
// by fixed, internally-controlled message text (never by user input), so the
// substring match cannot be spoofed by a caller.
export function mapExpenseApprovalError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_EXPENSE_APPROVAL_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Cash pool, project, kategori, atau vendor tidak ditemukan atau bukan milik tenant Anda.";
    case "23514":
      return "Nominal harus lebih besar dari nol, dan keterangan wajib diisi.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized to create")) {
        return "Anda tidak memiliki izin untuk membuat submission biaya.";
      }
      if (error.message?.includes("not authorized to revise")) {
        return "Anda tidak memiliki izin untuk merevisi submission biaya.";
      }
      if (error.message?.includes("not authorized to submit")) {
        return "Anda tidak memiliki izin untuk mengirim submission biaya untuk review.";
      }
      if (error.message?.includes("not authorized to review")) {
        return "Hanya owner yang dapat mereview (approve/reject/minta koreksi) submission biaya.";
      }
      if (error.message?.includes("not authorized to reverse")) {
        return "Anda tidak memiliki izin untuk melakukan reversal biaya.";
      }
      if (error.message?.includes("cannot be revised in its current status")) {
        return "Submission ini tidak dapat direvisi pada status saat ini.";
      }
      if (error.message?.includes("cannot be submitted from its current status")) {
        return "Submission ini tidak dapat dikirim untuk review pada status saat ini.";
      }
      if (error.message?.includes("requires a new revision before resubmission")) {
        return "Submission yang perlu koreksi wajib direvisi terlebih dahulu sebelum dikirim ulang.";
      }
      if (error.message?.includes("is not awaiting review")) {
        return "Submission ini tidak sedang menunggu review — mungkin sudah diproses sebelumnya.";
      }
      if (error.message?.includes("rejection reason is required")) {
        return "Alasan penolakan wajib diisi.";
      }
      if (error.message?.includes("correction reason is required")) {
        return "Alasan koreksi wajib diisi.";
      }
      if (error.message?.includes("closed to new expenses")) {
        return "Project sudah closed dan tidak dapat menerima biaya baru.";
      }
      if (error.message?.includes("amount must be greater than zero")) {
        return "Nominal harus lebih besar dari nol.";
      }
      if (error.message?.includes("expense description is required")) {
        return "Keterangan biaya wajib diisi.";
      }
      if (error.message?.includes("status unchanged")) {
        return "Status submission tidak berubah.";
      }
      if (error.message?.includes("invalid expense submission status transition")) {
        return "Transisi status submission tidak valid.";
      }
      if (error.message?.includes("already reversed")) {
        return "Biaya ini sudah pernah dikoreksi (reversal) sebelumnya.";
      }
      if (error.message?.includes("only an original expense can be reversed")) {
        return "Hanya biaya asli yang dapat dikoreksi (reversal), bukan entri reversal lain.";
      }
      if (error.message?.includes("reversal reason is required")) {
        return "Alasan koreksi (reversal) wajib diisi.";
      }
      if (error.message?.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_EXPENSE_APPROVAL_ERROR;
    default:
      return GENERIC_EXPENSE_APPROVAL_ERROR;
  }
}
