import { describe, expect, it } from "vitest";
import { canManageUserManagement, canViewUserManagement } from "./access";

describe("canViewUserManagement", () => {
  it("allows owner", () => {
    expect(canViewUserManagement(["owner"])).toBe(true);
  });

  it("allows admin", () => {
    expect(canViewUserManagement(["admin"])).toBe(true);
  });

  it("denies reviewer", () => {
    expect(canViewUserManagement(["reviewer"])).toBe(false);
  });

  it("denies viewer", () => {
    expect(canViewUserManagement(["viewer"])).toBe(false);
  });

  it("denies no roles", () => {
    expect(canViewUserManagement([])).toBe(false);
  });
});

describe("canManageUserManagement", () => {
  it("allows owner", () => {
    expect(canManageUserManagement(["owner"])).toBe(true);
  });

  it("denies admin", () => {
    expect(canManageUserManagement(["admin"])).toBe(false);
  });

  it("denies reviewer", () => {
    expect(canManageUserManagement(["reviewer"])).toBe(false);
  });

  it("denies viewer", () => {
    expect(canManageUserManagement(["viewer"])).toBe(false);
  });
});
