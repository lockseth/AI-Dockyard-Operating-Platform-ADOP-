// Best-effort WhatsApp number normalization — strips everything but digits
// and rewrites a leading "0" (common Indonesian local-format entry) to the
// "62" country code. Never rejects input that doesn't fit: this gate only
// stores the number for future Billing/Collection delivery, no verification
// or sending happens here, so normalization is "if possible", not a hard
// validation rule.
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }

  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

// Used before building any PostgREST `.or()` filter string for search —
// strips characters that are structural to that mini filter grammar
// (comma separates conditions, parentheses group them) so user input can
// never reshape the query beyond "match this term".
export function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[%,()]/g, "");
}
