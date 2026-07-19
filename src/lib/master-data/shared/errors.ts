import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_MASTER_DATA_ERROR = "Gagal menyimpan data. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser — map the small set
// of error codes the UI needs to react to differently, and fall back to one
// generic message for everything else (unique_violation on a code, a
// cross-tenant/foreign-tenant reference, or an RLS/role rejection).
export function mapMasterDataError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_MASTER_DATA_ERROR;
  }

  switch (error.code) {
    case "23505":
      return "Kode ini sudah digunakan pada tenant Anda. Gunakan kode lain.";
    case "23503":
      return "Data terkait tidak ditemukan atau bukan milik tenant Anda.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    default:
      return GENERIC_MASTER_DATA_ERROR;
  }
}
