import { describe, expect, it } from "vitest";
import { canAccessInvoiceEvidence } from "./access";

describe("canAccessInvoiceEvidence", () => {
  it("allows owner and admin", () => {
    expect(canAccessInvoiceEvidence(["owner"])).toBe(true);
    expect(canAccessInvoiceEvidence(["admin"])).toBe(true);
  });

  it("rejects reviewer and viewer — Gate 4A Contract §7 is narrower than master-data read", () => {
    expect(canAccessInvoiceEvidence(["reviewer"])).toBe(false);
    expect(canAccessInvoiceEvidence(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canAccessInvoiceEvidence([])).toBe(false);
  });
});
