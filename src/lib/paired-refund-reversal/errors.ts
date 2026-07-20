import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_PAIRED_REFUND_REVERSAL_ERROR = "Gagal memproses reversal refund project. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Every `raise
// exception` in reverse_paired_project_refund (20260720150000) is a fixed,
// internally-controlled message under the generic P0001 code — matched
// here by stable substring, mirroring cash-pool/errors.ts and
// cost-ledger/errors.ts's own convention.
export function mapPairedRefundReversalError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
  }

  switch (error.code) {
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("not authorized")) {
        return "Hanya Owner yang dapat melakukan reversal refund project.";
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
      if (message.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
    }
    default:
      return GENERIC_PAIRED_REFUND_REVERSAL_ERROR;
  }
}
