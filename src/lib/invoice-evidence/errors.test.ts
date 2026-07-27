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

  it("maps a duplicate invoice-number-per-legal-entity conflict without leaking the constraint name", () => {
    const message = mapInvoiceEvidenceError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "invoices_legal_entity_invoice_number_uidx"',
    } as never);
    expect(message).toMatch(/sudah terdaftar untuk legal entity/);
    expect(message).not.toMatch(/uidx|constraint/);
  });

  it("maps due_date must not be before invoice_date to an Indonesian message", () => {
    const message = mapInvoiceEvidenceError({ code: "P0001", message: "due_date must not be before invoice_date" } as never);
    expect(message).toMatch(/jatuh tempo tidak boleh sebelum/);
  });

  it("maps an unknown legal entity to an Indonesian message", () => {
    const message = mapInvoiceEvidenceError({ code: "P0001", message: "legal entity not found for this tenant" } as never);
    expect(message).toMatch(/legal entity tidak ditemukan/i);
  });

  it("maps incomplete billing metadata at issuance to a single actionable Indonesian message", () => {
    const message = mapInvoiceEvidenceError({ code: "P0001", message: "invoice_number must be registered before issuance" } as never);
    expect(message).toMatch(/lengkapi legal entity, nomor invoice/i);
  });

  it("maps metadata-locked-outside-draft to an Indonesian message", () => {
    const message = mapInvoiceEvidenceError({
      code: "P0001",
      message: "invoice billing metadata is locked outside draft status",
    } as never);
    expect(message).toMatch(/metadata invoice terkunci/i);
  });
});
