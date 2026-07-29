import { describe, expect, it } from "vitest";
import { getSafeReplyText, isReplyRequired } from "./safe-replies";
import type { SafeReplyCode } from "./types";

const ALL_CODES: SafeReplyCode[] = [
  "paired",
  "verified",
  "invalid_or_expired",
  "locked",
  "ambiguous",
  "duplicate",
  "rate_limited",
  "ignored_unsupported_command",
  "invalid_request",
];

describe("safe-replies allowlist", () => {
  it("every safe reply code maps to a defined (possibly empty) template — never undefined", () => {
    for (const code of ALL_CODES) {
      expect(typeof getSafeReplyText(code)).toBe("string");
    }
  });

  it("never leaks the word 'error', a stack trace marker, or a raw outcome string into a template", () => {
    for (const code of ALL_CODES) {
      const text = getSafeReplyText(code);
      expect(text).not.toMatch(/error|exception|stack|outcome|null|undefined/i);
    }
  });

  it("ignored_unsupported_command and invalid_request never require a reply", () => {
    expect(isReplyRequired("ignored_unsupported_command")).toBe(false);
    expect(isReplyRequired("invalid_request")).toBe(false);
  });

  it("every other code requires a reply", () => {
    for (const code of ALL_CODES) {
      if (code === "ignored_unsupported_command" || code === "invalid_request") continue;
      expect(isReplyRequired(code)).toBe(true);
    }
  });
});
