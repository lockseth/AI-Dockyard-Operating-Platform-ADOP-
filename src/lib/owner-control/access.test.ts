import { describe, expect, it } from "vitest";
import { canAccessOwnerControl, resolvePostAuthDestination } from "./access";

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

describe("resolvePostAuthDestination", () => {
  it("sends an owner to /owner/control", () => {
    expect(resolvePostAuthDestination(["owner"])).toBe("/owner/control");
  });

  it("sends a user with multiple roles including owner to /owner/control", () => {
    expect(resolvePostAuthDestination(["viewer", "owner"])).toBe("/owner/control");
  });

  it("sends admin to /app", () => {
    expect(resolvePostAuthDestination(["admin"])).toBe("/app");
  });

  it("sends reviewer to /app", () => {
    expect(resolvePostAuthDestination(["reviewer"])).toBe("/app");
  });

  it("sends viewer to /app", () => {
    expect(resolvePostAuthDestination(["viewer"])).toBe("/app");
  });

  it("sends a user with no roles at all to /app", () => {
    expect(resolvePostAuthDestination([])).toBe("/app");
  });
});
