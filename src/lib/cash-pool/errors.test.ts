import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_CASH_POOL_ERROR, mapCashPoolError } from "./errors";

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

describe("mapCashPoolError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapCashPoolError(null)).toBe(GENERIC_CASH_POOL_ERROR);
    expect(mapCashPoolError(undefined)).toBe(GENERIC_CASH_POOL_ERROR);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapCashPoolError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 23514 (check_violation) to an amount message", () => {
    expect(mapCashPoolError(pgError("23514"))).toMatch(/lebih besar dari nol/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapCashPoolError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps a P0001 'not authorized' exception to a permission message", () => {
    expect(mapCashPoolError(pgError("P0001", "not authorized to record daily cash pool entry"))).toMatch(
      /tidak memiliki izin/i,
    );
  });

  it("maps a P0001 'already reversed' exception to a duplicate-reversal message", () => {
    expect(mapCashPoolError(pgError("P0001", "cash pool entry already reversed"))).toMatch(/sudah pernah dikoreksi/i);
  });

  it("maps a P0001 'only an original entry' exception to an invalid-target message", () => {
    expect(mapCashPoolError(pgError("P0001", "only an original entry can be reversed"))).toMatch(
      /entri asli/i,
    );
  });

  it("maps a P0001 'reversal reason is required' exception to a reason-required message", () => {
    expect(mapCashPoolError(pgError("P0001", "reversal reason is required"))).toMatch(/alasan koreksi/i);
  });

  it("maps a P0001 'amount must be greater than zero' exception to an amount message", () => {
    expect(mapCashPoolError(pgError("P0001", "amount must be greater than zero"))).toMatch(/lebih besar dari nol/i);
  });

  it("maps a P0001 not-found exception to a not-found message", () => {
    expect(mapCashPoolError(pgError("P0001", "daily cash pool not found"))).toMatch(/tidak ditemukan/i);
    expect(mapCashPoolError(pgError("P0001", "cash pool entry not found"))).toMatch(/tidak ditemukan/i);
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapCashPoolError(pgError("P0001", "some other db exception"))).toBe(GENERIC_CASH_POOL_ERROR);
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapCashPoolError(pgError("99999"))).toBe(GENERIC_CASH_POOL_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23503", "23514", "42501", "P0001", "unknown"]) {
      expect(mapCashPoolError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
