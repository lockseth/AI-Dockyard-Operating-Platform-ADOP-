import { describe, expect, it } from "vitest";
import { normalizeWhatsappNumber, sanitizeSearchTerm } from "./normalization";

describe("normalizeWhatsappNumber", () => {
  it("returns null for null/undefined/empty input", () => {
    expect(normalizeWhatsappNumber(null)).toBeNull();
    expect(normalizeWhatsappNumber(undefined)).toBeNull();
    expect(normalizeWhatsappNumber("")).toBeNull();
    expect(normalizeWhatsappNumber("   ")).toBeNull();
  });

  it("rewrites a leading 0 to the 62 country code", () => {
    expect(normalizeWhatsappNumber("081234567890")).toBe("6281234567890");
  });

  it("strips separators (spaces, dashes, parens, plus) before normalizing", () => {
    expect(normalizeWhatsappNumber("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsappNumber("(0812) 3456 7890")).toBe("6281234567890");
  });

  it("leaves an already-international number's digits untouched", () => {
    expect(normalizeWhatsappNumber("+6281234567890")).toBe("6281234567890");
  });

  it("does not reject a number that doesn't fit any known pattern — best effort only", () => {
    expect(normalizeWhatsappNumber("12345")).toBe("12345");
  });

  it("never fabricates a verified/valid claim — returns digits only, no metadata", () => {
    const result = normalizeWhatsappNumber("081234567890");
    expect(typeof result).toBe("string");
    expect(result).not.toMatch(/verified/i);
  });
});

describe("sanitizeSearchTerm", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeSearchTerm("  client  ")).toBe("client");
  });

  it("strips characters that are structural to a PostgREST or() filter", () => {
    expect(sanitizeSearchTerm("a,b(c)d%e")).toBe("abcde");
  });

  it("leaves an ordinary search term unchanged", () => {
    expect(sanitizeSearchTerm("PT Kapal Nusantara")).toBe("PT Kapal Nusantara");
  });
});
