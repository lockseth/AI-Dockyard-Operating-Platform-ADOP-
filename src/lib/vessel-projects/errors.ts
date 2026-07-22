import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_VESSEL_PROJECT_ERROR = "Gagal menyimpan data project kapal. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Constraint
// violations from the table itself get a Postgres error code (23503,
// 42501); the lifecycle transition RPC raises plain `raise exception`
// messages, which Postgres reports under the generic P0001 code — those are
// matched by fixed, internally-controlled message text (never by user
// input), so the substring match cannot be spoofed by a caller.
export function mapVesselProjectError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_VESSEL_PROJECT_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Vessel, client, service type, atau facility location tidak ditemukan atau bukan milik tenant Anda.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001":
      if (error.message === "SHARED_OVERHEAD_ALLOCATION_INCOMPLETE") {
        return "Project tidak dapat ditutup — masih ada Biaya Bersama/Overhead pada periode project ini yang belum dialokasikan penuh. Selesaikan alokasinya di halaman Biaya Bersama/Overhead terlebih dahulu.";
      }
      if (error.message?.includes("not authorized")) {
        return "Anda tidak memiliki izin untuk mengubah status project ini.";
      }
      if (error.message?.includes("invalid vessel project lifecycle transition")) {
        return "Transisi status project tidak valid.";
      }
      if (error.message?.includes("status unchanged")) {
        return "Status project tidak berubah.";
      }
      if (error.message?.includes("not found")) {
        return "Project tidak ditemukan.";
      }
      return GENERIC_VESSEL_PROJECT_ERROR;
    default:
      return GENERIC_VESSEL_PROJECT_ERROR;
  }
}
