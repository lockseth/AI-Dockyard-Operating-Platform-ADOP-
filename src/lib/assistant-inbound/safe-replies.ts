import type { SafeReplyCode } from "./types";

// Closed allowlist — the ONLY text n8n is ever told to send (task LOCK H:
// "hanya gunakan allowlisted static templates berdasarkan safeReplyCode —
// bukan arbitrary error/messageText"). Never built from a raw RPC error or
// the inbound messageText.
const SAFE_REPLY_TEMPLATES: Record<SafeReplyCode, string> = {
  paired: "Nomor WhatsApp berhasil dipasangkan.",
  verified: "Nomor WhatsApp Anda berhasil diverifikasi.",
  invalid_or_expired: "Kode tidak valid atau sudah kedaluwarsa. Silakan minta kode baru.",
  locked: "Terlalu banyak percobaan salah. Silakan minta kode baru dari admin.",
  ambiguous: "Permintaan tidak dapat diproses saat ini. Silakan hubungi admin.",
  duplicate: "Permintaan ini sudah diproses sebelumnya.",
  rate_limited: "Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.",
  ignored_unsupported_command: "",
  invalid_request: "",
};

export function getSafeReplyText(code: SafeReplyCode): string {
  return SAFE_REPLY_TEMPLATES[code];
}

// unsupported/invalid_request never reply — this gate builds no FAQ/chat
// bounce-back (task LOCK D), so unrecognized noise is silently dropped,
// not templated.
export function isReplyRequired(code: SafeReplyCode): boolean {
  return code !== "ignored_unsupported_command" && code !== "invalid_request";
}
