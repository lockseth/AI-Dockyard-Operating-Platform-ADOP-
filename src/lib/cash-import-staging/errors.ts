import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_CASH_IMPORT_STAGING_ERROR = "Gagal memproses staging import kas. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Every RPC in
// 20260720000000_cash_import_staging.sql raises a fixed, internally-
// controlled message (never derived from user input) under the generic
// P0001 code — matched here by stable substring, mirroring
// expense-duplicate-detection/errors.ts's convention.
export function mapCashImportStagingError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_CASH_IMPORT_STAGING_ERROR;
  }

  switch (error.code) {
    case "23514":
      return "Data staging tidak valid (melanggar aturan baris).";
    case "23503":
      return "Referensi data tidak valid atau lintas tenant.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("not authorized to approve")) {
        return "Hanya Owner yang dapat menyetujui dan memasukkan data import kas.";
      }
      if (message.includes("not authorized to reject")) {
        return "Hanya Owner yang dapat menolak batch import kas.";
      }
      if (message.includes("not authorized")) {
        return "Hanya admin yang dapat mengubah staging import kas.";
      }
      if (message.includes("BATCH_COMMITTED_IMMUTABLE")) {
        return "Batch ini sudah disetujui dan dimasukkan ke data operasional — tidak dapat diubah lagi.";
      }
      if (message.includes("BATCH_ALREADY_COMMITTED")) {
        return "Batch ini sudah disetujui sebelumnya. Tidak ada data yang digandakan.";
      }
      if (message.includes("BATCH_NOT_READY_FOR_REVIEW")) {
        return "Batch belum siap untuk disetujui atau ditolak pada status saat ini.";
      }
      if (message.includes("not authorized to rollback")) {
        return "Hanya Owner yang dapat membatalkan (rollback) batch import kas.";
      }
      if (message.includes("BATCH_ALREADY_ROLLED_BACK")) {
        return "Batch ini sudah pernah dibatalkan (rollback) sebelumnya.";
      }
      if (message.includes("BATCH_NOT_COMMITTED")) {
        return "Hanya batch yang sudah disetujui (committed) yang dapat dibatalkan (rollback).";
      }
      if (message.includes("CASH_POOL_NOT_OPEN_FOR_ROLLBACK")) {
        return "Kas harian tanggal ini sudah ditutup atau rekonsiliasi EOD sudah disetujui — rollback tidak dapat dilakukan.";
      }
      if (message.includes("IMPORT_PROVENANCE_INCOMPLETE")) {
        return "Data provenance import tidak lengkap atau tidak seimbang — rollback dibatalkan demi keamanan data.";
      }
      if (message.includes("rollback reason is required")) {
        return "Alasan rollback wajib diisi.";
      }
      if (message.includes("MANUAL_REVIEW_UNRESOLVED")) {
        return "Masih ada baris berstatus 'Perlu Tinjauan Manual' yang belum diputuskan sebagai include/skip.";
      }
      if (message.includes("MAPPING_NOT_COMMITTABLE")) {
        return "Masih ada baris dengan mapping yang belum dapat dimasukkan ke data operasional (kandidat proyek baru/unresolved).";
      }
      if (message.includes("OPENING_BALANCE_CONFLICT")) {
        return "Kas harian tanggal ini sudah memiliki transaksi — saldo awal tidak dapat dimasukkan lagi.";
      }
      if (message.includes("CASH_POOL_NOT_OPEN")) {
        return "Kas harian tanggal ini sudah ditutup/pending close, tidak dapat menerima transaksi baru.";
      }
      if (message.includes("UNEXPECTED_ROW_DIRECTION") || message.includes("INVALID_ROW_AMOUNT")) {
        return "Terdapat baris dengan nilai debit/kredit yang tidak sesuai dengan mapping-nya.";
      }
      if (message.includes("rejection reason is required")) {
        return "Alasan penolakan wajib diisi.";
      }
      if (message.includes("MAPPING_PROJECT_REQUIRED")) {
        return "Pilih Project Kapal untuk mapping existing_vessel_project.";
      }
      if (message.includes("CROSS_TENANT_PROJECT_MAPPING_REJECTED")) {
        return "Project Kapal yang dipilih bukan milik tenant ini.";
      }
      if (message.includes("ERROR_ROW_CANNOT_INCLUDE")) {
        return "Baris berstatus error tidak dapat disertakan (include).";
      }
      if (message.includes("SKIP_REASON_REQUIRED")) {
        return "Alasan wajib diisi saat memilih Lewati (skip).";
      }
      if (message.includes("opening balance row does not accept a disposition")) {
        return "Baris saldo awal tidak memerlukan mapping atau disposisi.";
      }
      if (message.includes("BATCH_NOT_ELIGIBLE_FOR_REVIEW")) {
        return "Batch tidak dapat disiapkan untuk review pada status saat ini.";
      }
      if (message.includes("VALIDATION_ERRORS_PRESENT")) {
        return "Masih ada baris error — perbaiki sumber data sebelum melanjutkan.";
      }
      if (message.includes("RECONCILIATION_VARIANCE")) {
        return "Saldo penutup belum rekonsiliasi (variance bukan nol).";
      }
      if (message.includes("MAPPING_INCOMPLETE")) {
        return "Masih ada label kapal/kategori yang belum dipetakan.";
      }
      if (message.includes("DISPOSITION_INCOMPLETE")) {
        return "Masih ada baris yang belum memiliki keputusan (disposition).";
      }
      if (message.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      if (message.includes("no rows to stage")) {
        return "File tidak memiliki baris transaksi untuk di-staging.";
      }
      return GENERIC_CASH_IMPORT_STAGING_ERROR;
    }
    default:
      return GENERIC_CASH_IMPORT_STAGING_ERROR;
  }
}
