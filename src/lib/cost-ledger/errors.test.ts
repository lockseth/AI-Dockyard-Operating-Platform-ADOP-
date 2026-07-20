import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_COST_LEDGER_ERROR, mapCostLedgerError } from "./errors";

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

describe("mapCostLedgerError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapCostLedgerError(null)).toBe(GENERIC_COST_LEDGER_ERROR);
    expect(mapCostLedgerError(undefined)).toBe(GENERIC_COST_LEDGER_ERROR);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapCostLedgerError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 23514 (check_violation) to an amount/description message", () => {
    expect(mapCostLedgerError(pgError("23514"))).toMatch(/lebih besar dari nol/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapCostLedgerError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps a P0001 'not authorized' exception to a permission message", () => {
    expect(mapCostLedgerError(pgError("P0001", "not authorized to record project expense"))).toMatch(
      /tidak memiliki izin/i,
    );
  });

  it("maps a P0001 'closed to new expenses' exception to a closed-project message", () => {
    expect(mapCostLedgerError(pgError("P0001", "vessel project is closed to new expenses"))).toMatch(/closed/i);
  });

  it("maps a P0001 'already reversed' exception to a duplicate-reversal message", () => {
    expect(mapCostLedgerError(pgError("P0001", "project expense already reversed"))).toMatch(/sudah pernah dikoreksi/i);
  });

  it("maps a P0001 PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL exception to a paired-refund guidance message (Gate 1K.1)", () => {
    expect(mapCostLedgerError(pgError("P0001", "PAIRED_REFUND_REQUIRES_ATOMIC_REVERSAL"))).toMatch(/reversal atomik/i);
  });

  it("maps a P0001 'only an original expense' exception to an invalid-target message", () => {
    expect(mapCostLedgerError(pgError("P0001", "only an original expense can be reversed"))).toMatch(
      /biaya asli/i,
    );
  });

  it("maps a P0001 'cannot reverse a reversal' exception distinctly", () => {
    expect(mapCostLedgerError(pgError("P0001", "cannot reverse a reversal"))).toMatch(/tidak dapat direversal lagi/i);
  });

  it("maps a P0001 'reversal reason is required' exception to a reason-required message", () => {
    expect(mapCostLedgerError(pgError("P0001", "reversal reason is required"))).toMatch(/alasan koreksi/i);
  });

  it("maps a P0001 'amount must be greater than zero' exception to an amount message", () => {
    expect(mapCostLedgerError(pgError("P0001", "amount must be greater than zero"))).toMatch(/lebih besar dari nol/i);
  });

  it("maps a P0001 'expense description is required' exception to a description message", () => {
    expect(mapCostLedgerError(pgError("P0001", "expense description is required"))).toMatch(/keterangan biaya/i);
  });

  it("maps a P0001 'must reference an entry in the same' exception to a mismatch message", () => {
    expect(mapCostLedgerError(pgError("P0001", "reversal must reference an entry in the same cash pool"))).toMatch(
      /tenant, cash pool, dan project yang sama/i,
    );
  });

  it("maps a P0001 not-found exception to a not-found message", () => {
    expect(mapCostLedgerError(pgError("P0001", "daily cash pool not found"))).toMatch(/tidak ditemukan/i);
    expect(mapCostLedgerError(pgError("P0001", "project cost ledger entry not found"))).toMatch(/tidak ditemukan/i);
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapCostLedgerError(pgError("P0001", "some other db exception"))).toBe(GENERIC_COST_LEDGER_ERROR);
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapCostLedgerError(pgError("99999"))).toBe(GENERIC_COST_LEDGER_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23503", "23514", "42501", "P0001", "unknown"]) {
      expect(mapCostLedgerError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
