import { describe, expect, it } from "vitest";
import { canAccessDailyOperations } from "./access";

describe("canAccessDailyOperations", () => {
  it("allows owner", () => {
    expect(canAccessDailyOperations(["owner"])).toBe(true);
  });

  it("allows admin", () => {
    expect(canAccessDailyOperations(["admin"])).toBe(true);
  });

  it("allows a user with multiple roles including admin", () => {
    expect(canAccessDailyOperations(["viewer", "admin"])).toBe(true);
  });

  it("denies reviewer-only access", () => {
    expect(canAccessDailyOperations(["reviewer"])).toBe(false);
  });

  it("denies viewer-only access", () => {
    expect(canAccessDailyOperations(["viewer"])).toBe(false);
  });

  it("denies a user with no roles at all", () => {
    expect(canAccessDailyOperations([])).toBe(false);
  });
});
