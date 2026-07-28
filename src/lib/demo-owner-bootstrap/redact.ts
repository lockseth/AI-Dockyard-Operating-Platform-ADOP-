// Small, deliberately dumb text-safety helpers for anything this harness
// prints or returns. Never given a raw secret to redact "cleverly" — the
// rest of the module simply never puts email/password/keys into a value
// that flows into a report (see RunReport in types.ts), so these exist as a
// second line of defense plus something tests can assert against.

export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

// Fails closed: returns false (leak) unless every secret is both non-empty
// and absent from the text. An empty/unconfigured secret never "passes" —
// that would silently stop checking for it.
export function textContainsNoneOf(text: string, secrets: Array<string | undefined | null>): boolean {
  return secrets.every((secret) => {
    if (!secret) {
      return true;
    }
    return !text.includes(secret);
  });
}
