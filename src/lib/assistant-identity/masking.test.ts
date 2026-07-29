import { describe, expect, it } from "vitest";
import { maskPhoneNumber } from "./masking";

describe("maskPhoneNumber", () => {
  it("masks the middle digits of a typical E.164 number", () => {
    const masked = maskPhoneNumber("+6281234567890");
    expect(masked).not.toBe("+6281234567890");
    expect(masked.startsWith("+62")).toBe(true);
    expect(masked.endsWith("90")).toBe(true);
    expect(masked).toContain("*");
  });

  it("never returns the original digits in the masked middle", () => {
    const original = "+6281234567890";
    const masked = maskPhoneNumber(original);
    const middleOriginal = original.slice(3, -2);
    const middleMasked = masked.slice(3, -2);
    expect(middleMasked).not.toBe(middleOriginal);
    expect(middleMasked).toBe("*".repeat(middleOriginal.length));
  });

  it("fully masks a very short string rather than throwing", () => {
    expect(maskPhoneNumber("123")).toBe("***");
    expect(maskPhoneNumber("")).toBe("");
  });

  it("is deterministic for the same input", () => {
    expect(maskPhoneNumber("+6281234567890")).toBe(maskPhoneNumber("+6281234567890"));
  });
});
