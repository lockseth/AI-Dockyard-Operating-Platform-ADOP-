import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SIGNATURE_REPLAY_WINDOW_SECONDS, verifyInboundSignature } from "./signature";

const SECRET = "test-signing-secret";
const RAW_BODY = JSON.stringify({ provider: "fonnte", providerMessageId: "wamid.1" });
const NOW = 1_800_000_000;

function sign(secret: string, timestampHeader: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`, "utf8").digest("hex");
}

describe("verifyInboundSignature", () => {
  it("accepts a correctly signed request within the replay window", () => {
    const timestampHeader = String(NOW);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);

    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader, signatureHeader, secret: SECRET, nowSeconds: NOW }),
    ).toBe(true);
  });

  it("fails closed when the secret is unconfigured (empty string), even with an otherwise-correct signature", () => {
    const timestampHeader = String(NOW);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);

    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader, signatureHeader, secret: "", nowSeconds: NOW }),
    ).toBe(false);
  });

  it("rejects a missing timestamp header", () => {
    const signatureHeader = sign(SECRET, String(NOW), RAW_BODY);
    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader: null, signatureHeader, secret: SECRET, nowSeconds: NOW }),
    ).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(
      verifyInboundSignature({
        rawBody: RAW_BODY,
        timestampHeader: String(NOW),
        signatureHeader: null,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("rejects a non-numeric timestamp header", () => {
    const signatureHeader = sign(SECRET, "not-a-number", RAW_BODY);
    expect(
      verifyInboundSignature({
        rawBody: RAW_BODY,
        timestampHeader: "not-a-number",
        signatureHeader,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("rejects a wrong signature for the correct timestamp/body", () => {
    expect(
      verifyInboundSignature({
        rawBody: RAW_BODY,
        timestampHeader: String(NOW),
        signatureHeader: "0".repeat(64),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("rejects a signature computed over a DIFFERENT body than the one supplied (exact canonical body binding)", () => {
    const timestampHeader = String(NOW);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);
    const tamperedBody = JSON.stringify({ provider: "fonnte", providerMessageId: "wamid.TAMPERED" });

    expect(
      verifyInboundSignature({
        rawBody: tamperedBody,
        timestampHeader,
        signatureHeader,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it("accepts a timestamp exactly at the replay window boundary", () => {
    const timestampHeader = String(NOW - SIGNATURE_REPLAY_WINDOW_SECONDS);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);
    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader, signatureHeader, secret: SECRET, nowSeconds: NOW }),
    ).toBe(true);
  });

  it("rejects a timestamp just past the replay window (stale/replayed request)", () => {
    const timestampHeader = String(NOW - SIGNATURE_REPLAY_WINDOW_SECONDS - 1);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);
    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader, signatureHeader, secret: SECRET, nowSeconds: NOW }),
    ).toBe(false);
  });

  it("rejects a timestamp far in the future (clock-skew abuse), not just the past", () => {
    const timestampHeader = String(NOW + SIGNATURE_REPLAY_WINDOW_SECONDS + 1);
    const signatureHeader = sign(SECRET, timestampHeader, RAW_BODY);
    expect(
      verifyInboundSignature({ rawBody: RAW_BODY, timestampHeader, signatureHeader, secret: SECRET, nowSeconds: NOW }),
    ).toBe(false);
  });

  it("does not throw on a malformed (wrong-length) signature header — constant-time compare via digest", () => {
    expect(() =>
      verifyInboundSignature({
        rawBody: RAW_BODY,
        timestampHeader: String(NOW),
        signatureHeader: "short",
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).not.toThrow();
  });
});
