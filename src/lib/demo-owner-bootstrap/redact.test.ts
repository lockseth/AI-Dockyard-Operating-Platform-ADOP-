import { describe, expect, it } from "vitest";
import { redactEmail, textContainsNoneOf } from "./redact";

describe("redactEmail", () => {
  it("masks the local part but keeps the domain readable", () => {
    const result = redactEmail("founder-demo@example.test");
    expect(result).toMatch(/^f\*+@example\.test$/);
    expect(result).not.toContain("founder-demo");
  });

  it("never returns the original email verbatim", () => {
    const email = "someone@example.test";
    expect(redactEmail(email)).not.toBe(email);
  });

  it("falls back safely for a malformed value", () => {
    expect(redactEmail("not-an-email")).toBe("***");
  });
});

describe("textContainsNoneOf", () => {
  it("fails (returns false) when a configured secret is present", () => {
    expect(textContainsNoneOf("token=abc123 in report", ["abc123"])).toBe(false);
  });

  it("passes when no secret is present", () => {
    expect(textContainsNoneOf("plain report text", ["abc123", "def456"])).toBe(true);
  });

  it("fails closed: an unconfigured/empty secret does not silently pass unrelated leaks", () => {
    // An empty secret can't be searched for, but it must never mask a real
    // one also present in the same check.
    expect(textContainsNoneOf("token=abc123", ["", "abc123"])).toBe(false);
  });
});
