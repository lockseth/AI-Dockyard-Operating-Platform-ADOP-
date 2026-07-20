import { describe, expect, it } from "vitest";
import { formatBusinessDateLabel, formatRupiah, getJakartaBusinessDate } from "./format";

describe("getJakartaBusinessDate", () => {
  it("returns the Jakarta-local date for a UTC morning timestamp", () => {
    // 2026-07-20T02:00:00Z is 2026-07-20T09:00 in Asia/Jakarta (UTC+7).
    expect(getJakartaBusinessDate(new Date("2026-07-20T02:00:00.000Z"))).toBe("2026-07-20");
  });

  it("rolls over to the next Jakarta day for a late UTC timestamp", () => {
    // 2026-07-20T17:30:00Z is 2026-07-21T00:30 in Asia/Jakarta — a UTC date
    // that is still "today" would wrongly report the previous business day.
    expect(getJakartaBusinessDate(new Date("2026-07-20T17:30:00.000Z"))).toBe("2026-07-21");
  });

  it("stays on the same Jakarta day just before the UTC rollover boundary", () => {
    // 2026-07-20T16:59:59Z is 2026-07-20T23:59:59 in Asia/Jakarta.
    expect(getJakartaBusinessDate(new Date("2026-07-20T16:59:59.000Z"))).toBe("2026-07-20");
  });
});

describe("formatBusinessDateLabel", () => {
  it("formats a business date key as an Indonesian long date", () => {
    expect(formatBusinessDateLabel("2026-07-20")).toBe("20 Juli 2026");
  });
});

describe("formatRupiah", () => {
  it("formats a positive integer amount with thousands separators", () => {
    expect(formatRupiah(1250000)).toBe("Rp 1.250.000");
  });

  it("formats zero", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
  });

  it("rounds fractional amounts to the nearest rupiah", () => {
    expect(formatRupiah(1000.6)).toBe("Rp 1.001");
  });

  it("falls back to Rp 0 for null or undefined", () => {
    expect(formatRupiah(null)).toBe("Rp 0");
    expect(formatRupiah(undefined)).toBe("Rp 0");
  });
});
