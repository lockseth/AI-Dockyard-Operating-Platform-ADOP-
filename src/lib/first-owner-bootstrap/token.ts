import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// 256 bits of entropy, base64url so it drops cleanly into a URL path segment
// with no re-encoding. This value exists in exactly two places: the one-time
// link handed to the operator/claimant, and briefly in memory while the
// claim Server Action hashes it — it is NEVER written to the database or to
// any log. Only its sha256 hex digest (hashBootstrapToken below) is stored,
// in first_owner_bootstrap_tokens.token_hash.
export function generateBootstrapToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashBootstrapToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Constant-time comparison so token lookup failure paths never leak timing
// information about how much of a guessed token matched. Used by callers
// that already have a candidate hash to compare against a known one (mainly
// tests) — the RPC itself compares via an equality-indexed column lookup,
// which is not a per-character timing oracle the way a string compare in
// application code could be.
export function bootstrapTokenHashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
