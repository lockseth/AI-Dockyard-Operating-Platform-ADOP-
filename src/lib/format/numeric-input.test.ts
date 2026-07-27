import { describe, expect, it } from "vitest";
import { formatThousands, sanitizeDigits } from "./numeric-input";

describe("sanitizeDigits", () => {
  it("keeps only digits", () => {
    expect(sanitizeDigits("1.000.000")).toBe("1000000");
  });

  it("strips letters and symbols", () => {
    expect(sanitizeDigits("Rp 1,500abc")).toBe("1500");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeDigits("")).toBe("");
  });
});

describe("formatThousands", () => {
  it("formats with Indonesian thousand separators", () => {
    expect(formatThousands("1000000")).toBe("1.000.000");
  });

  it("returns empty string for empty digits", () => {
    expect(formatThousands("")).toBe("");
  });

  it("returns 0 for a zero value", () => {
    expect(formatThousands("0")).toBe("0");
  });

  it("does not group small numbers", () => {
    expect(formatThousands("42")).toBe("42");
  });

  it("drops leading zeros", () => {
    expect(formatThousands("0007")).toBe("7");
  });
});
