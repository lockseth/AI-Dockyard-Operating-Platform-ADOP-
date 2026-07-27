import { describe, expect, it } from "vitest";
import { mapInvoiceDeliveryError } from "./errors";

describe("mapInvoiceDeliveryError", () => {
  it("returns a generic message when there is no error", () => {
    expect(mapInvoiceDeliveryError(null)).toMatch(/Gagal/);
  });

  it("never leaks raw Postgres error text for P0001 messages", () => {
    const message = mapInvoiceDeliveryError({
      code: "P0001",
      message: "invoice must be issued before recording a delivery event",
    } as never);
    expect(message).not.toMatch(/invoice must be issued/);
    expect(message).toMatch(/sudah diterbitkan/);
  });

  it("maps not-authorized RPC messages to an Indonesian permission message", () => {
    const message = mapInvoiceDeliveryError({ code: "P0001", message: "not authorized to record invoice delivery event" } as never);
    expect(message).toMatch(/tidak memiliki izin/);
  });

  it("maps the already-acknowledged terminal-state message", () => {
    const message = mapInvoiceDeliveryError({
      code: "P0001",
      message: "invoice delivery is already acknowledged; no further events allowed",
    } as never);
    expect(message).toMatch(/sudah tercatat diterima/);
  });

  it("maps the acknowledgment-without-prior-delivery precondition message", () => {
    const message = mapInvoiceDeliveryError({
      code: "P0001",
      message: "acknowledgment requires a prior sent or delivered event",
    } as never);
    expect(message).toMatch(/Catat pengiriman terlebih dahulu/);
  });

  it("maps the delivered-without-prior-sent precondition message", () => {
    const message = mapInvoiceDeliveryError({
      code: "P0001",
      message: "delivered requires a prior sent event",
    } as never);
    expect(message).toMatch(/status terkirim/);
  });

  it("maps 42501 to a permission message", () => {
    expect(mapInvoiceDeliveryError({ code: "42501", message: "" } as never)).toMatch(/tidak memiliki izin/);
  });

  it("maps 23503 to a not-found/cross-tenant message", () => {
    expect(mapInvoiceDeliveryError({ code: "23503", message: "" } as never)).toMatch(/tidak ditemukan/);
  });

  it("falls back to the generic message for an unrecognized code", () => {
    expect(mapInvoiceDeliveryError({ code: "99999", message: "whatever" } as never)).toMatch(/Gagal/);
  });

  it("falls back to the generic message for an unrecognized P0001 message", () => {
    expect(mapInvoiceDeliveryError({ code: "P0001", message: "something entirely unexpected" } as never)).toMatch(/Gagal/);
  });
});
