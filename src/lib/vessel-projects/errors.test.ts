import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_VESSEL_PROJECT_ERROR, mapVesselProjectError } from "./errors";

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

describe("mapVesselProjectError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapVesselProjectError(null)).toBe(GENERIC_VESSEL_PROJECT_ERROR);
    expect(mapVesselProjectError(undefined)).toBe(GENERIC_VESSEL_PROJECT_ERROR);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapVesselProjectError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapVesselProjectError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps a P0001 'not authorized' exception to a permission message", () => {
    expect(mapVesselProjectError(pgError("P0001", "not authorized to transition vessel project lifecycle"))).toMatch(
      /tidak memiliki izin/i,
    );
  });

  it("maps a P0001 'invalid transition' exception to an invalid-transition message", () => {
    expect(
      mapVesselProjectError(pgError("P0001", "invalid vessel project lifecycle transition from active to closed")),
    ).toMatch(/transisi status/i);
  });

  it("maps a P0001 'status unchanged' exception to an unchanged-status message", () => {
    expect(mapVesselProjectError(pgError("P0001", "vessel project lifecycle status unchanged: already active"))).toMatch(
      /tidak berubah/i,
    );
  });

  it("maps a P0001 'not found' exception to a not-found message", () => {
    expect(mapVesselProjectError(pgError("P0001", "vessel project not found"))).toMatch(/tidak ditemukan/i);
  });

  it("maps a P0001 DRAFT_ACTIVATION_MISSING_FACILITY_LOCATION exception to a clear missing-field message", () => {
    expect(mapVesselProjectError(pgError("P0001", "DRAFT_ACTIVATION_MISSING_FACILITY_LOCATION"))).toMatch(
      /facility location/i,
    );
  });

  it("maps a P0001 CROSS_TENANT_FACILITY_LOCATION_REJECTED exception to a cross-tenant message", () => {
    expect(mapVesselProjectError(pgError("P0001", "CROSS_TENANT_FACILITY_LOCATION_REJECTED"))).toMatch(
      /bukan milik tenant/i,
    );
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapVesselProjectError(pgError("P0001", "some other db exception"))).toBe(GENERIC_VESSEL_PROJECT_ERROR);
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapVesselProjectError(pgError("99999"))).toBe(GENERIC_VESSEL_PROJECT_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23503", "42501", "P0001", "unknown"]) {
      expect(mapVesselProjectError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
