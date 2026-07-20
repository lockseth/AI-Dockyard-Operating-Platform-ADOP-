import { describe, expect, it } from "vitest";
import { canAccessOwnerControl } from "./access";

describe("canAccessOwnerControl", () => {
  it("allows owner", () => {
    expect(canAccessOwnerControl(["owner"])).toBe(true);
  });

  it("allows a user with multiple roles including owner", () => {
    expect(canAccessOwnerControl(["viewer", "owner"])).toBe(true);
  });

  it("denies admin-only access", () => {
    expect(canAccessOwnerControl(["admin"])).toBe(false);
  });

  it("denies reviewer-only access", () => {
    expect(canAccessOwnerControl(["reviewer"])).toBe(false);
  });

  it("denies viewer-only access", () => {
    expect(canAccessOwnerControl(["viewer"])).toBe(false);
  });

  it("denies a user with no roles at all", () => {
    expect(canAccessOwnerControl([])).toBe(false);
  });
});
