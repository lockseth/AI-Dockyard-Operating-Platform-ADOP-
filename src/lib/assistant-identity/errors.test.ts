import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_ASSISTANT_IDENTITY_ERROR, mapAssistantIdentityError } from "./errors";

function err(code: string, message: string): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: "",
    name: "PostgrestError",
    toJSON: () => ({ code, message, details: "", hint: "", name: "PostgrestError" }),
  };
}

describe("mapAssistantIdentityError", () => {
  it("returns the generic message when there is no error", () => {
    expect(mapAssistantIdentityError(null)).toBe(GENERIC_ASSISTANT_IDENTITY_ERROR);
    expect(mapAssistantIdentityError(undefined)).toBe(GENERIC_ASSISTANT_IDENTITY_ERROR);
  });

  it("maps 42501 to an authorization message", () => {
    expect(mapAssistantIdentityError(err("42501", "Not authorized to pair"))).toBe(
      "Anda tidak memiliki izin untuk melakukan aksi ini.",
    );
  });

  it("maps P0002 to a not-found message", () => {
    expect(mapAssistantIdentityError(err("P0002", "Assistant channel identity not found"))).toBe(
      "Data tidak ditemukan.",
    );
  });

  it("maps P000I to a contact-inactive message", () => {
    expect(mapAssistantIdentityError(err("P000I", "Client contact is not active"))).toBe(
      "Kontak client tidak aktif.",
    );
  });

  it("maps 23505 to a duplicate-number message", () => {
    expect(mapAssistantIdentityError(err("23505", "duplicate key value"))).toBe(
      "Nomor ini sudah terverifikasi pada identitas/kontak lain.",
    );
  });

  it("maps 22023 unsupported-channel by message substring", () => {
    expect(mapAssistantIdentityError(err("22023", "Unsupported assistant channel: telegram"))).toBe(
      "Channel assistant ini belum didukung.",
    );
  });

  it("maps 22023 missing-number by message substring", () => {
    expect(
      mapAssistantIdentityError(err("22023", "Client contact has no WhatsApp number to verify")),
    ).toBe("Kontak client ini belum memiliki nomor WhatsApp.");
  });

  it("maps 22023 E.164 format errors by message substring", () => {
    expect(
      mapAssistantIdentityError(err("22023", "normalized_address must be E.164 (+countrycode...)")),
    ).toBe("Nomor harus dalam format E.164 (contoh: +6281234567890).");
  });

  it("maps 22023 blank-code errors by message substring", () => {
    expect(mapAssistantIdentityError(err("22023", "code is required"))).toBe("Kode wajib diisi.");
  });

  it("falls back to the generic message for an unrecognized 22023 message", () => {
    expect(mapAssistantIdentityError(err("22023", "something else entirely"))).toBe(
      GENERIC_ASSISTANT_IDENTITY_ERROR,
    );
  });

  it("falls back to the generic message for an unmapped code", () => {
    expect(mapAssistantIdentityError(err("99999", "whatever"))).toBe(GENERIC_ASSISTANT_IDENTITY_ERROR);
  });

  it("never echoes the raw Postgres error message back", () => {
    const mapped = mapAssistantIdentityError(err("42501", "Not authorized to pair an assistant channel identity"));
    expect(mapped).not.toContain("assistant channel identity");
  });
});
