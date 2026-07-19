import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_MASTER_DATA_ERROR, mapMasterDataError } from "./errors";

function pgError(code: string): PostgrestError {
  const message = "raw postgres detail — must never reach the browser";
  return {
    code,
    message,
    details: "",
    hint: "",
    name: "PostgrestError",
    toJSON: () => ({ code, message, details: "", hint: "", name: "PostgrestError" }),
  };
}

describe("mapMasterDataError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapMasterDataError(null)).toBe(GENERIC_MASTER_DATA_ERROR);
    expect(mapMasterDataError(undefined)).toBe(GENERIC_MASTER_DATA_ERROR);
  });

  it("maps 23505 (unique_violation) to a duplicate-code message", () => {
    expect(mapMasterDataError(pgError("23505"))).toMatch(/sudah digunakan/i);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapMasterDataError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapMasterDataError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapMasterDataError(pgError("99999"))).toBe(GENERIC_MASTER_DATA_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23505", "23503", "42501", "unknown"]) {
      expect(mapMasterDataError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
