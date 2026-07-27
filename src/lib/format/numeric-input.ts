// Pure helpers behind every masked numeric input in the app (money,
// quantity, duration, etc.). Kept framework-free so the formatting rule
// lives in exactly one place — see NumericTextInput.

const thousandsFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

// Strips everything but digits — the raw value that goes to the server.
// Decimal points are intentionally not preserved: every current caller maps
// to a whole-unit business field (Rupiah, days), matching their existing
// step="1" behavior.
export function sanitizeDigits(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

// "" for empty so callers can tell "no value typed yet" apart from "0".
export function formatThousands(digits: string): string {
  if (!digits) return "";
  return thousandsFormatter.format(Number(digits));
}
