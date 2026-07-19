import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR =
  "Gagal memproses kandidat duplikasi biaya. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Table constraint
// violations get a real Postgres error code (23503, 23514, 42501); the RPC's
// `raise exception` messages report under the generic P0001 code — matched
// by fixed, internally-controlled message text (never by user input), so the
// substring match cannot be spoofed by a caller.
export function mapExpenseDuplicateDetectionError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR;
  }

  switch (error.code) {
    case "23514":
      return "Data resolusi kandidat duplikasi tidak valid.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message?.includes("not authorized to resolve")) {
        return "Hanya owner yang dapat memutuskan kandidat duplikasi biaya.";
      }
      if (error.message?.includes("already resolved")) {
        return "Kandidat duplikasi ini sudah pernah diputuskan sebelumnya.";
      }
      if (error.message?.includes("resolution reason is required")) {
        return "Alasan resolusi kandidat duplikasi wajib diisi.";
      }
      if (error.message?.includes("invalid expense duplicate candidate resolution")) {
        return "Keputusan resolusi tidak valid.";
      }
      if (error.message?.includes("not found")) {
        return "Kandidat duplikasi tidak ditemukan.";
      }
      return GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR;
    default:
      return GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR;
  }
}
