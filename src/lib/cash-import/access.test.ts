import { describe, expect, it } from "vitest";
import { canAccessCashImport } from "./access";

describe("canAccessCashImport", () => {
  it("allows admin", () => {
    expect(canAccessCashImport(["admin"])).toBe(true);
  });

  it("rejects owner — owner does not perform import per Gate 1J-A lock", () => {
    expect(canAccessCashImport(["owner"])).toBe(false);
  });

  it("rejects reviewer and viewer", () => {
    expect(canAccessCashImport(["reviewer"])).toBe(false);
    expect(canAccessCashImport(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canAccessCashImport([])).toBe(false);
  });

  it("allows a user who holds admin alongside other roles", () => {
    expect(canAccessCashImport(["viewer", "admin"])).toBe(true);
  });
});
