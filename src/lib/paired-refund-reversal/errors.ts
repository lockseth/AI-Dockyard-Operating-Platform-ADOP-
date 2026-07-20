import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_PAIRED_REFUND_REVERSAL_ERROR = "Gagal memproses reversal refund project. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Every `raise
// exception` in reverse_paired_project_refund (20260720150000, hardened by
// 20260720160000) is a fixed, internally-controlled message under the
// generic P0001 code — matched here by stable substring, mirroring
// cash-pool/errors.ts and cost-ledger/errors.ts's own convention.
//
// Gate 1K.1A: a missing cash/cost id, a cross-tenant id, and an id the
// caller lacks Owner role for are all collapsed into the single 'NOT_FOUND'
// exception (never a distinct "not authorized" message) — this mapper must
// not reintroduce that distinction in the message shown to the user.
export function mapPairedRefundReversalError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
  }

  switch (error.code) {
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("NOT_FOUND")) {
        return "Data tidak ditemukan.";
      }
      if (message.includes("PAIRED_REFUND_PARTIALLY_REVERSED")) {
        return "Hanya satu sisi transaksi refund yang telah direversal. Transaksi memerlukan pemeriksaan Owner.";
      }
      if (message.includes("INVALID_PAIRED_REFUND")) {
        return "Entri yang dipilih bukan pasangan refund project yang valid.";
      }
      if (message.includes("reversal reason is required")) {
        return "Alasan reversal wajib diisi.";
      }
      return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
    }
    default:
      return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
  }
}
