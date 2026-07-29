// Small, deliberately dumb text-safety helper — mirrors
// src/lib/demo-owner-bootstrap/redact.ts's redactEmail. Never given a raw
// challenge code or secret to mask "cleverly"; the rest of this module
// simply never returns a plaintext code from anywhere except the one-time
// issue result. Used wherever a phone number reaches a report, log line, or
// test description (contract §15: "Nomor hanya boleh ditampilkan masked
// pada report/test output").

export function maskPhoneNumber(normalizedAddress: string): string {
  const trimmed = normalizedAddress.trim();
  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }
  const visibleStart = trimmed.slice(0, trimmed.startsWith("+") ? 3 : 2);
  const visibleEnd = trimmed.slice(-2);
  const maskedLength = trimmed.length - visibleStart.length - visibleEnd.length;
  return `${visibleStart}${"*".repeat(Math.max(maskedLength, 0))}${visibleEnd}`;
}
