import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Layered on top of x-internal-secret (src/lib/notification-outbox/
// internal-auth.ts, reused as-is for this route) — this is the ADDITIONAL
// canonical-request signature task LOCK B asks for, not a replacement.
// Signature covers timestamp + the EXACT raw request body bytes n8n sent
// (never a re-serialized/re-parsed copy, which could differ in key order
// or whitespace from what the signer hashed) — so the route must verify
// this BEFORE JSON.parse-ing the body at all.
export const SIGNATURE_REPLAY_WINDOW_SECONDS = 300;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function computeCanonicalSignature(secret: string, timestampHeader: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`, "utf8").digest("hex");
}

export interface VerifyInboundSignatureParams {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  secret: string;
  nowSeconds: number;
}

// Fails closed on every axis: unconfigured secret, missing headers,
// malformed timestamp, replay outside the window, or a mismatched digest
// all return false — never a partial pass. nowSeconds is caller-supplied
// (not read from Date.now() internally) so this stays a pure, deterministic
// function for tests.
export function verifyInboundSignature(params: VerifyInboundSignatureParams): boolean {
  const { rawBody, timestampHeader, signatureHeader, secret, nowSeconds } = params;

  if (!secret) return false;
  if (!timestampHeader || !signatureHeader) return false;
  if (!/^\d+$/.test(timestampHeader)) return false;

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_REPLAY_WINDOW_SECONDS) return false;

  const expected = computeCanonicalSignature(secret, timestampHeader, rawBody);

  // Fixed-length digest of both sides before comparing — timingSafeEqual on
  // the raw hex strings would throw/short-circuit on any length mismatch,
  // which happens on every malformed signature header (mirrors
  // notification-outbox/secret.ts's identical reasoning).
  return timingSafeEqual(digest(signatureHeader), digest(expected));
}
