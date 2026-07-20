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
      if (message.includes("not authorized")) {
        return "Hanya admin yang dapat mengubah staging import kas.";
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
