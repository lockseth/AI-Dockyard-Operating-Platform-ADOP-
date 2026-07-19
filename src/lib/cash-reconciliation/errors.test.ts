import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_CASH_RECONCILIATION_ERROR, mapCashReconciliationError } from "./errors";

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

describe("mapCashReconciliationError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapCashReconciliationError(null)).toBe(GENERIC_CASH_RECONCILIATION_ERROR);
    expect(mapCashReconciliationError(undefined)).toBe(GENERIC_CASH_RECONCILIATION_ERROR);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapCashReconciliationError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 23505 (unique_violation) to an active-reconciliation message", () => {
    expect(mapCashReconciliationError(pgError("23505"))).toMatch(/sudah ada rekonsiliasi aktif/i);
  });

  it("maps 23514 (check_violation) to a negative-amount message", () => {
    expect(mapCashReconciliationError(pgError("23514"))).toMatch(/tidak boleh negatif/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapCashReconciliationError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps 'not authorized to create' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "not authorized to create cash reconciliation"))).toMatch(
      /membuat rekonsiliasi kas/i,
    );
  });

  it("maps 'not authorized to revise' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "not authorized to revise cash reconciliation"))).toMatch(
      /merevisi rekonsiliasi kas/i,
    );
  });

  it("maps 'not authorized to submit' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "not authorized to submit cash reconciliation"))).toMatch(
      /mengirim rekonsiliasi kas/i,
    );
  });

  it("maps 'not authorized to review' to an owner-only message", () => {
    expect(mapCashReconciliationError(pgError("P0001", "not authorized to review cash reconciliation"))).toMatch(
      /hanya owner/i,
    );
  });

  it("maps 'not authorized to reopen' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "not authorized to reopen cash pool"))).toMatch(
      /membuka kembali cash pool/i,
    );
  });

  it("maps 'cash pool is not open for a new reconciliation' distinctly", () => {
    expect(
      mapCashReconciliationError(pgError("P0001", "cash pool is not open for a new reconciliation")),
    ).toMatch(/pending close atau sudah closed/i);
  });

  it("maps 'cash pool is not open for new financial entries' distinctly", () => {
    expect(
      mapCashReconciliationError(
        pgError("P0001", "cash pool is not open for new financial entries: current status closed"),
      ),
    ).toMatch(/transaksi baru ditolak/i);
  });

  it("maps 'cash pool is not pending close' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "cash pool is not pending close"))).toMatch(
      /tidak sedang menunggu penutupan/i,
    );
  });

  it("maps 'cash pool is not closed' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "cash pool is not closed"))).toMatch(/belum closed/i);
  });

  it("maps 'cannot be revised in its current status' distinctly", () => {
    expect(
      mapCashReconciliationError(pgError("P0001", "cash reconciliation cannot be revised in its current status")),
    ).toMatch(/tidak dapat direvisi/i);
  });

  it("maps 'cannot be submitted from its current status' distinctly", () => {
    expect(
      mapCashReconciliationError(
        pgError("P0001", "cash reconciliation cannot be submitted from its current status"),
      ),
    ).toMatch(/tidak dapat dikirim untuk review/i);
  });

  it("maps 'requires a new revision before resubmission' distinctly", () => {
    expect(
      mapCashReconciliationError(pgError("P0001", "cash reconciliation requires a new revision before resubmission")),
    ).toMatch(/wajib direvisi terlebih dahulu/i);
  });

  it("maps 'is not awaiting review' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "cash reconciliation is not awaiting review"))).toMatch(
      /tidak sedang menunggu review/i,
    );
  });

  it("maps 'actual counted cash must not be negative' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "actual counted cash must not be negative"))).toMatch(
      /tidak boleh negatif/i,
    );
  });

  it("maps 'explanation is required when variance is non-zero' distinctly", () => {
    expect(
      mapCashReconciliationError(pgError("P0001", "explanation is required when variance is non-zero")),
    ).toMatch(/wajib diisi/i);
  });

  it("maps 'rejection reason is required' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "rejection reason is required"))).toMatch(/alasan penolakan/i);
  });

  it("maps 'correction reason is required' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "correction reason is required"))).toMatch(/alasan koreksi/i);
  });

  it("maps 'reopen reason is required' distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "reopen reason is required"))).toMatch(
      /pembukaan kembali wajib diisi/i,
    );
  });

  it("maps 'status unchanged' distinctly", () => {
    expect(
      mapCashReconciliationError(pgError("P0001", "cash reconciliation status unchanged: already draft")),
    ).toMatch(/status rekonsiliasi tidak berubah/i);
  });

  it("maps 'invalid cash reconciliation status transition' distinctly", () => {
    expect(
      mapCashReconciliationError(
        pgError("P0001", "invalid cash reconciliation status transition from draft to approved"),
      ),
    ).toMatch(/transisi status rekonsiliasi tidak valid/i);
  });

  it("maps RECONCILIATION_STALE distinctly", () => {
    expect(mapCashReconciliationError(pgError("P0001", "RECONCILIATION_STALE"))).toMatch(
      /berubah sejak rekonsiliasi ini disubmit/i,
    );
  });

  it("maps a not-found exception to a not-found message", () => {
    expect(mapCashReconciliationError(pgError("P0001", "cash reconciliation not found"))).toMatch(/tidak ditemukan/i);
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapCashReconciliationError(pgError("P0001", "some other db exception"))).toBe(
      GENERIC_CASH_RECONCILIATION_ERROR,
    );
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapCashReconciliationError(pgError("99999"))).toBe(GENERIC_CASH_RECONCILIATION_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23503", "23505", "23514", "42501", "P0001", "unknown"]) {
      expect(mapCashReconciliationError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
