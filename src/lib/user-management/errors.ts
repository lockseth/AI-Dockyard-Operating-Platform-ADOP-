import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_USER_MANAGEMENT_ERROR = "Gagal memproses permintaan. Silakan coba lagi.";

// Every membership/role/invitation mutation now goes through a SECURITY
// DEFINER RPC (public.create_tenant_invitation / accept_tenant_invitation /
// set_membership_role / set_membership_status) that performs its own
// authorization, self-target, and invariant checks and surfaces failures as
// a plain `raise exception` — Postgres reports that as a generic error whose
// message text is exactly what the function wrote. Matched by substring
// (not sqlstate alone, since several distinct conditions share errcode
// 42501) so each gets its own friendly Indonesian message instead of one
// generic "not authorized".
export function mapUserManagementError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_USER_MANAGEMENT_ERROR;
  }

  const message = error.message ?? "";

  if (message.includes("last active owner") || message.includes("last owner role")) {
    return "Tidak dapat menonaktifkan atau mengubah role owner aktif terakhir pada tenant ini.";
  }
  if (message.includes("Cannot change your own")) {
    return "Anda tidak dapat mengubah role atau status keanggotaan Anda sendiri.";
  }
  if (message.includes("already an active member")) {
    return "Pengguna ini sudah menjadi anggota aktif pada tenant ini.";
  }
  if (message.includes("does not belong to the current user")) {
    return "Undangan ini tidak berlaku untuk akun Anda.";
  }
  if (message.includes("already accepted")) {
    return "Undangan ini sudah diterima sebelumnya.";
  }
  // Note: the expired-but-still-pending case is never surfaced as a thrown
  // Postgres error — accept_tenant_invitation returns NULL for it instead
  // (see the migration comment), and service.ts's acceptInvitation() maps
  // that null result to the "invalid/expired" message directly.
  if (message.includes("Not authorized")) {
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  }

  switch (error.code) {
    case "P0002":
      return "Data tidak ditemukan.";
    case "PGRST116":
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini, atau data tidak ditemukan.";
    case "23505":
      return "Pengguna ini sudah terdaftar pada tenant Anda.";
    case "23503":
      return "Data terkait tidak ditemukan.";
    default:
      return GENERIC_USER_MANAGEMENT_ERROR;
  }
}
