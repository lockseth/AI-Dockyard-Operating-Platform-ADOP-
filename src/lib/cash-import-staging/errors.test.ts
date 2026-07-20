import { describe, expect, it } from "vitest";
import { GENERIC_CASH_IMPORT_STAGING_ERROR, mapCashImportStagingError } from "./errors";

function p0001(message: string) {
  return { code: "P0001", message } as never;
}

describe("mapCashImportStagingError", () => {
  it("returns the generic message when there is no error", () => {
    expect(mapCashImportStagingError(null)).toBe(GENERIC_CASH_IMPORT_STAGING_ERROR);
    expect(mapCashImportStagingError(undefined)).toBe(GENERIC_CASH_IMPORT_STAGING_ERROR);
  });

  it("maps not-authorized to a role-specific message", () => {
    expect(mapCashImportStagingError(p0001("not authorized to stage cash import batch"))).toContain("admin");
  });

  it("maps every stable staging error code to a distinct, non-generic message", () => {
    const codes = [
      "MAPPING_PROJECT_REQUIRED",
      "CROSS_TENANT_PROJECT_MAPPING_REJECTED",
      "ERROR_ROW_CANNOT_INCLUDE",
      "SKIP_REASON_REQUIRED",
      "BATCH_NOT_ELIGIBLE_FOR_REVIEW",
      "VALIDATION_ERRORS_PRESENT",
      "RECONCILIATION_VARIANCE",
      "MAPPING_INCOMPLETE",
      "DISPOSITION_INCOMPLETE",
    ];
    for (const code of codes) {
      expect(mapCashImportStagingError(p0001(code))).not.toBe(GENERIC_CASH_IMPORT_STAGING_ERROR);
    }
  });

  it("falls back to a generic message for an unrecognized P0001 message", () => {
    expect(mapCashImportStagingError(p0001("something unexpected"))).toBe(GENERIC_CASH_IMPORT_STAGING_ERROR);
  });

  it("maps constraint and permission error codes", () => {
    expect(mapCashImportStagingError({ code: "23514", message: "" } as never)).not.toBe(
      GENERIC_CASH_IMPORT_STAGING_ERROR,
    );
    expect(mapCashImportStagingError({ code: "42501", message: "" } as never)).not.toBe(
      GENERIC_CASH_IMPORT_STAGING_ERROR,
    );
  });
});
