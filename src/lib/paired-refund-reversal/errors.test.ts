import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_PAIRED_REFUND_REVERSAL_ERROR, mapPairedRefundReversalError } from "./errors";

function pgError(code: string, message = "raw postgres detail — must never reach the browser"): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: "",
    name: "PostgrestError",
    toJSON: () => ({ code, message, details: "", hint: "", name: "PostgrestError" }),
  };
}

describe("mapPairedRefundReversalError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapPairedRefundReversalError(null)).toBe(GENERIC_PAIRED_REFUND_REVERSAL_ERROR);
    expect(mapPairedRefundReversalError(undefined)).toBe(GENERIC_PAIRED_REFUND_REVERSAL_ERROR);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapPairedRefundReversalError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps a P0001 'not authorized' exception to an owner-only message", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "not authorized to reverse paired project refund"))).toMatch(
      /hanya owner/i,
    );
  });

  it("maps PAIRED_REFUND_PARTIALLY_REVERSED to the integrity-exception explanation", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "PAIRED_REFUND_PARTIALLY_REVERSED"))).toMatch(
      /satu sisi transaksi refund/i,
    );
  });

  it("maps INVALID_PAIRED_REFUND to a not-a-valid-pair message", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "INVALID_PAIRED_REFUND"))).toMatch(/bukan pasangan refund/i);
  });

  it("maps a P0001 'reversal reason is required' exception to a reason-required message", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "reversal reason is required"))).toMatch(/alasan reversal/i);
  });

  it("maps a P0001 not-found exception to a not-found message", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "cash pool entry not found"))).toMatch(/tidak ditemukan/i);
    expect(mapPairedRefundReversalError(pgError("P0001", "project cost ledger entry not found"))).toMatch(
      /tidak ditemukan/i,
    );
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapPairedRefundReversalError(pgError("P0001", "some other db exception"))).toBe(
      GENERIC_PAIRED_REFUND_REVERSAL_ERROR,
    );
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapPairedRefundReversalError(pgError("99999"))).toBe(GENERIC_PAIRED_REFUND_REVERSAL_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["42501", "P0001", "unknown"]) {
      expect(mapPairedRefundReversalError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
