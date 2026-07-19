import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_EXPENSE_APPROVAL_ERROR, mapExpenseApprovalError } from "./errors";

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

describe("mapExpenseApprovalError", () => {
  it("returns the generic message for null/undefined error", () => {
    expect(mapExpenseApprovalError(null)).toBe(GENERIC_EXPENSE_APPROVAL_ERROR);
    expect(mapExpenseApprovalError(undefined)).toBe(GENERIC_EXPENSE_APPROVAL_ERROR);
  });

  it("maps 23503 (foreign_key_violation) to a related-data message", () => {
    expect(mapExpenseApprovalError(pgError("23503"))).toMatch(/tidak ditemukan/i);
  });

  it("maps 23514 (check_violation) to an amount/description message", () => {
    expect(mapExpenseApprovalError(pgError("23514"))).toMatch(/lebih besar dari nol/i);
  });

  it("maps 42501 (insufficient_privilege / RLS) to a permission message", () => {
    expect(mapExpenseApprovalError(pgError("42501"))).toMatch(/tidak memiliki izin/i);
  });

  it("maps 'not authorized to create' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "not authorized to create expense submission"))).toMatch(
      /membuat submission biaya/i,
    );
  });

  it("maps 'not authorized to revise' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "not authorized to revise expense submission"))).toMatch(
      /merevisi submission biaya/i,
    );
  });

  it("maps 'not authorized to submit' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "not authorized to submit expense submission"))).toMatch(
      /mengirim submission biaya/i,
    );
  });

  it("maps 'not authorized to review' to an owner-only message", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "not authorized to review expense submission"))).toMatch(
      /hanya owner/i,
    );
  });

  it("maps 'not authorized to reverse' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "not authorized to reverse project expense"))).toMatch(
      /reversal biaya/i,
    );
  });

  it("maps 'cannot be revised in its current status' distinctly", () => {
    expect(
      mapExpenseApprovalError(pgError("P0001", "expense submission cannot be revised in its current status")),
    ).toMatch(/tidak dapat direvisi/i);
  });

  it("maps 'cannot be submitted from its current status' distinctly", () => {
    expect(
      mapExpenseApprovalError(pgError("P0001", "expense submission cannot be submitted from its current status")),
    ).toMatch(/tidak dapat dikirim untuk review/i);
  });

  it("maps 'requires a new revision before resubmission' distinctly", () => {
    expect(
      mapExpenseApprovalError(pgError("P0001", "expense submission requires a new revision before resubmission")),
    ).toMatch(/wajib direvisi terlebih dahulu/i);
  });

  it("maps 'is not awaiting review' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "expense submission is not awaiting review"))).toMatch(
      /tidak sedang menunggu review/i,
    );
  });

  it("maps 'rejection reason is required' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "rejection reason is required"))).toMatch(/alasan penolakan/i);
  });

  it("maps 'correction reason is required' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "correction reason is required"))).toMatch(/alasan koreksi/i);
  });

  it("maps 'closed to new expenses' to a closed-project message", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "vessel project is closed to new expenses"))).toMatch(/closed/i);
  });

  it("maps 'amount must be greater than zero' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "amount must be greater than zero"))).toMatch(
      /lebih besar dari nol/i,
    );
  });

  it("maps 'expense description is required' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "expense description is required"))).toMatch(/keterangan biaya/i);
  });

  it("maps 'status unchanged' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "expense submission status unchanged: already draft"))).toMatch(
      /status submission tidak berubah/i,
    );
  });

  it("maps 'invalid expense submission status transition' distinctly", () => {
    expect(
      mapExpenseApprovalError(pgError("P0001", "invalid expense submission status transition from draft to approved")),
    ).toMatch(/transisi status submission tidak valid/i);
  });

  it("maps 'already reversed' distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "project expense already reversed"))).toMatch(
      /sudah pernah dikoreksi/i,
    );
  });

  it("maps DUPLICATE_REVIEW_REQUIRED distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "DUPLICATE_REVIEW_REQUIRED"))).toMatch(
      /kandidat duplikasi yang belum ditinjau/i,
    );
  });

  it("maps DUPLICATE_CONFIRMED distinctly", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "DUPLICATE_CONFIRMED"))).toMatch(
      /terkonfirmasi duplikat/i,
    );
  });

  it("maps a not-found exception to a not-found message", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "expense submission not found"))).toMatch(/tidak ditemukan/i);
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapExpenseApprovalError(pgError("P0001", "some other db exception"))).toBe(GENERIC_EXPENSE_APPROVAL_ERROR);
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(mapExpenseApprovalError(pgError("99999"))).toBe(GENERIC_EXPENSE_APPROVAL_ERROR);
  });

  it("never leaks the raw Postgres error message", () => {
    for (const code of ["23503", "23514", "42501", "P0001", "unknown"]) {
      expect(mapExpenseApprovalError(pgError(code))).not.toContain("raw postgres detail");
    }
  });
});
