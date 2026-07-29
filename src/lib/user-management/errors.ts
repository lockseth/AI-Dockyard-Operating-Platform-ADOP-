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
  // Checked before the generic "already accepted" match below — this
  // message contains that same substring, but is a distinct
  // owner_provision_invited_member outcome (Gate 6G-H) that needs its own
  // text, not accept_tenant_invitation's.
  if (message.includes("Invitation already accepted with a different outcome")) {
    return "Undangan ini sudah diproses sebelumnya dengan hasil yang berbeda.";
  }
  if (message.includes("already accepted")) {
    return "Undangan ini sudah diterima sebelumnya.";
  }
  // Note: the expired-but-still-pending case is never surfaced as a thrown
  // Postgres error — accept_tenant_invitation and owner_provision_invited_
  // member both return a NULL result for it instead (see their migration
  // comments), and service.ts maps that null result to the "invalid/
  // expired" message directly.
  if (message.includes("Not authorized")) {
    return "Anda tidak memiliki izin untuk melakukan aksi ini.";
  }

  // public.owner_provision_invited_member's distinct STOP conditions (Gate
  // 6G-H) — each raised message is matched by substring the same way as the
  // block above, so this can share the same generic fallback/switch below.
  if (message.includes("cross_tenant_pending_invitation_conflict")) {
    return "Email ini masih memiliki undangan tertunda pada tenant lain. Selesaikan konflik tersebut terlebih dahulu.";
  }
  if (message.includes("Target has membership in another tenant")) {
    return "Pengguna ini sudah memiliki keanggotaan aktif atau nonaktif pada tenant lain.";
  }
  if (message.includes("Target identity is ambiguous")) {
    return "Identitas pengguna untuk email ini tidak dapat dipastikan.";
  }
  if (message.includes("Role mismatch with pending invitation")) {
    return "Role yang diminta tidak lagi sesuai dengan undangan yang tertunda. Muat ulang halaman.";
  }
  if (message.includes("Target already has a membership in this tenant")) {
    return "Pengguna ini sudah memiliki keanggotaan pada tenant ini.";
  }
  if (message.includes("Invitation is not pending")) {
    return "Undangan ini tidak lagi berstatus tertunda.";
  }
  if (message.includes("Invitation state conflict")) {
    return "Status undangan ini berubah secara tak terduga. Muat ulang halaman dan coba lagi.";
  }

  // public.owner_authorize_member_password_reset's distinct STOP conditions
  // (Gate 6G-H direct provisioning) — checked before the generic
  // "Not authorized"/42501 fallbacks below, since both raise a message
  // containing "authorized"-adjacent text handled separately here.
  if (message.includes("Cannot reset your own temporary password")) {
    return "Anda tidak dapat mereset kata sandi Anda sendiri.";
  }
  if (message.includes("Membership is not active")) {
    return "Kata sandi sementara hanya dapat direset untuk anggota yang berstatus aktif.";
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
