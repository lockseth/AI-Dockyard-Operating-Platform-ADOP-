import { describe, expect, it } from "vitest";
import { mapInvoiceEvidenceError } from "./errors";

describe("mapInvoiceEvidenceError", () => {
  it("returns a generic message when there is no error", () => {
    expect(mapInvoiceEvidenceError(null)).toMatch(/Gagal/);
  });

  it("never leaks raw Postgres error text for P0001 messages", () => {
    const message = mapInvoiceEvidenceError({
      code: "P0001",
      message: "transaction entry is already bound to an active invoice",
    } as never);
    expect(message).not.toMatch(/transaction entry is already bound/);
    expect(message).toMatch(/terikat pada invoice aktif lain/);
  });

  it("maps not-authorized RPC messages to an Indonesian permission message", () => {
    const message = mapInvoiceEvidenceError({ code: "P0001", message: "not authorized to bind invoice transaction" } as never);
    expect(message).toMatch(/tidak memiliki izin/);
  });

  it("maps the closed-project guard message", () => {
    const message = mapInvoiceEvidenceError({ code: "P0001", message: "vessel project must be closed before billing its transactions" } as never);
    expect(message).toMatch(/closed/);
  });

  it("maps 42501 to a permission message", () => {
    expect(mapInvoiceEvidenceError({ code: "42501", message: "" } as never)).toMatch(/tidak memiliki izin/);
  });

  it("maps 23505 (duplicate storage_path) to a friendly message", () => {
    expect(mapInvoiceEvidenceError({ code: "23505", message: "" } as never)).toMatch(/sudah pernah diunggah/);
  });

  it("falls back to the generic message for an unrecognized code", () => {
    expect(mapInvoiceEvidenceError({ code: "99999", message: "whatever" } as never)).toMatch(/Gagal/);
  });
});
