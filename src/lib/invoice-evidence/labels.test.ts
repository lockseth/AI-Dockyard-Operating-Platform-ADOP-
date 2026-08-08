import { describe, expect, it } from "vitest";
import { formatInvoiceMetadataDate } from "./labels";

// Regression: Billing Workspace review page used to render invoice_date/
// due_date as the raw ISO string ("2026-08-08") while the Invoice detail
// page rendered the same column formatted as a localized date — the same
// billing metadata shown two different ways depending on which page read
// it. Both pages now call this single formatter.
describe("formatInvoiceMetadataDate", () => {
  it("formats a date-only value as a localized id-ID date", () => {
    expect(formatInvoiceMetadataDate("2026-08-08")).toBe(new Date("2026-08-08").toLocaleDateString("id-ID"));
  });

  it("never returns the raw ISO string unformatted", () => {
    expect(formatInvoiceMetadataDate("2026-08-08")).not.toBe("2026-08-08");
  });

  it("falls back to a dash for null", () => {
    expect(formatInvoiceMetadataDate(null)).toBe("-");
  });

  it("falls back to a dash for undefined", () => {
    expect(formatInvoiceMetadataDate(undefined)).toBe("-");
  });
});
