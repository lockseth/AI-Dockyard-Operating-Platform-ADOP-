import { describe, expect, it } from "vitest";
import { bootstrapTokenHashesEqual, generateBootstrapToken, hashBootstrapToken } from "./token";

describe("generateBootstrapToken", () => {
  it("generates a long, URL-safe, non-empty token with no two calls colliding", () => {
    const a = generateBootstrapToken();
    const b = generateBootstrapToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("hashBootstrapToken", () => {
  it("is deterministic sha256 hex", () => {
    expect(hashBootstrapToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces different hashes for different tokens", () => {
    expect(hashBootstrapToken("token-a")).not.toEqual(hashBootstrapToken("token-b"));
  });
});

describe("bootstrapTokenHashesEqual", () => {
  it("returns true for identical hashes and false otherwise", () => {
    const hash = hashBootstrapToken("some-token");
    expect(bootstrapTokenHashesEqual(hash, hash)).toBe(true);
    expect(bootstrapTokenHashesEqual(hash, hashBootstrapToken("other-token"))).toBe(false);
    expect(bootstrapTokenHashesEqual(hash, "short")).toBe(false);
  });
});
