import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Fixed-length digest of both sides before comparing — timingSafeEqual on
// the raw strings would short-circuit (and leak length) whenever provided
// and expected differ in length, which happens on every wrong-length guess.
// Hashing first means the compare is always over two 32-byte buffers.
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Fails closed: an unconfigured (empty) secret never authorizes any request,
// regardless of what the caller sends.
export function verifyInternalSecret(provided: string | null | undefined, expected: string): boolean {
  if (!expected) {
    return false;
  }
  return timingSafeEqual(digest(provided ?? ""), digest(expected));
}
