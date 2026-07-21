import { describe, expect, it } from "vitest";
import { verifyInternalSecret } from "./secret";

describe("verifyInternalSecret", () => {
  it("accepts the exact configured secret", () => {
    expect(verifyInternalSecret("correct-secret", "correct-secret")).toBe(true);
  });

  it("rejects a wrong value of the same length", () => {
    expect(verifyInternalSecret("wrong-secretX", "correct-secret")).toBe(false);
  });

  it("rejects a value of a different length", () => {
    expect(verifyInternalSecret("short", "correct-secret")).toBe(false);
  });

  it("rejects null/undefined/empty provided values", () => {
    expect(verifyInternalSecret(null, "correct-secret")).toBe(false);
    expect(verifyInternalSecret(undefined, "correct-secret")).toBe(false);
    expect(verifyInternalSecret("", "correct-secret")).toBe(false);
  });

  it("fails closed when the expected secret is unconfigured, even against an empty guess", () => {
    expect(verifyInternalSecret("", "")).toBe(false);
    expect(verifyInternalSecret("anything", "")).toBe(false);
    expect(verifyInternalSecret(null, "")).toBe(false);
  });
});
