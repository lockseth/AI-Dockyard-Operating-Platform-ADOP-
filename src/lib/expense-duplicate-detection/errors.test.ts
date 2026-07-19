import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR, mapExpenseDuplicateDetectionError } from "./errors";

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

describe("mapExpenseDuplicateDetectionError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapExpenseDuplicateDetectionError(null)).toBe(GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR);
    expect(mapExpenseDuplicateDetectionError(undefined)).toBe(GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR);
  });

  it("maps 23514 (check_violation) to a validation message", () => {
    expect(mapExpenseDuplicateDetectionError(pgError("23514"))).toMatch(/tidak valid/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapExpenseDuplicateDetectionError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps 'not authorized to resolve' to an owner-only message", () => {
    expect(
      mapExpenseDuplicateDetectionError(pgError("P0001", "not authorized to resolve expense duplicate candidate")),
    ).toMatch(/hanya owner/i);
  });

  it("maps 'already resolved' distinctly", () => {
    expect(
      mapExpenseDuplicateDetectionError(pgError("P0001", "expense duplicate candidate already resolved")),
    ).toMatch(/sudah pernah diputuskan/i);
  });

  it("maps 'resolution reason is required' distinctly", () => {
    expect(
      mapExpenseDuplicateDetectionError(
        pgError("P0001", "expense duplicate candidate resolution reason is required"),
      ),
    ).toMatch(/alasan resolusi/i);
  });

  it("maps 'invalid expense duplicate candidate resolution' distinctly", () => {
    expect(
      mapExpenseDuplicateDetectionError(pgError("P0001", "invalid expense duplicate candidate resolution")),
    ).toMatch(/keputusan resolusi tidak valid/i);
  });

  it("maps a not-found exception to a not-found message", () => {
    expect(mapExpenseDuplicateDetectionError(pgError("P0001", "expense duplicate candidate not found"))).toMatch(
      /tidak ditemukan/i,
    );
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapExpenseDuplicateDetectionError(pgError("P0001", "some other db exception"))).toBe(
      GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR,
    );
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapExpenseDuplicateDetectionError(pgError("99999"))).toBe(GENERIC_EXPENSE_DUPLICATE_DETECTION_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23514", "42501", "P0001", "unknown"]) {
      expect(mapExpenseDuplicateDetectionError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
