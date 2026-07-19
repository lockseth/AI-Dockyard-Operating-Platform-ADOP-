import { describe, expect, it } from "vitest";
import { branding } from "./branding";

describe("branding", () => {
  it("does not reference PT Gamatara or other legal entity names", () => {
    const combined = Object.values(branding).join(" ").toLowerCase();

    expect(combined).not.toContain("gamatara");
    expect(combined).not.toContain("pt.");
    expect(combined).not.toMatch(/\bpt\b/);
  });
});
