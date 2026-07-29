import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_ASSISTANT_IDENTITY_ERROR = "Gagal memproses identitas assistant. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser. Matched by
// errcode first (stable, chosen by the migration), message substring only
// where one errcode covers several distinct validation messages — the
// substrings are internally-controlled RPC message text, never user input,
// so they cannot be spoofed by a caller.
export function mapAssistantIdentityError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_ASSISTANT_IDENTITY_ERROR;
  }

  switch (error.code) {
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0002":
      return "Data tidak ditemukan.";
    case "P000I":
      return "Kontak client tidak aktif.";
    case "23505":
      return "Nomor ini sudah terverifikasi pada identitas/kontak lain.";
    case "22023":
      if (error.message?.includes("Unsupported assistant channel")) {
        return "Channel assistant ini belum didukung.";
      }
      if (error.message?.includes("no WhatsApp number")) {
        return "Kontak client ini belum memiliki nomor WhatsApp.";
      }
      if (error.message?.includes("E.164")) {
        return "Nomor harus dalam format E.164 (contoh: +6281234567890).";
      }
      if (error.message?.includes("code is required")) {
        return "Kode wajib diisi.";
      }
      return GENERIC_ASSISTANT_IDENTITY_ERROR;
    default:
      return GENERIC_ASSISTANT_IDENTITY_ERROR;
  }
}
