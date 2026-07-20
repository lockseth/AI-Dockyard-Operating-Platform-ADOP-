import { describe, expect, it } from "vitest";
import { decodeTrustedTransactionCursor, encodeTrustedTransactionCursor } from "./types";

describe("encodeTrustedTransactionCursor / decodeTrustedTransactionCursor", () => {
  it("round-trips a cursor through encode then decode", () => {
    const cursor = { businessDate: "2036-01-06", createdAt: "2036-01-06T00:00:00Z", logicalTransactionId: "cash_pool:abc" };
    expect(decodeTrustedTransactionCursor(encodeTrustedTransactionCursor(cursor))).toEqual(cursor);
  });

  it("returns null for a token that is not valid base64url JSON", () => {
    expect(decodeTrustedTransactionCursor("not-a-valid-cursor!!!")).toBeNull();
  });

  it("returns null for a token decoding to a shape missing required fields", () => {
    const malformed = Buffer.from(JSON.stringify({ businessDate: "2036-01-06" }), "utf8").toString("base64url");
    expect(decodeTrustedTransactionCursor(malformed)).toBeNull();
  });

  it("returns null for a token decoding to a non-object JSON value", () => {
    const malformed = Buffer.from(JSON.stringify("just a string"), "utf8").toString("base64url");
    expect(decodeTrustedTransactionCursor(malformed)).toBeNull();
  });
});
