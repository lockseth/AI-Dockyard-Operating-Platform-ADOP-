import { describe, expect, it } from "vitest";
import { branding } from "./branding";

describe("branding", () => {
  it("does not reference PT CONTOH TENANT or other legal entity names", () => {
    const combined = Object.values(branding).join(" ").toLowerCase();

    expect(combined).not.toContain("contoh tenant");
    expect(combined).not.toContain("pt.");
    expect(combined).not.toMatch(/\bpt\b/);
  });
});
