import { describe, expect, it } from "vitest";
import { requireTenantRole, UnauthorizedTenantRoleError } from "./tenant";

describe("requireTenantRole", () => {
  it("does not throw when the caller has one of the allowed roles", () => {
    expect(() =>
      requireTenantRole({ roles: ["owner"] }, ["owner", "admin"]),
    ).not.toThrow();
  });

  it("does not throw when the caller has multiple roles including an allowed one", () => {
    expect(() =>
      requireTenantRole({ roles: ["viewer", "admin"] }, ["admin"]),
    ).not.toThrow();
  });

  it("throws UnauthorizedTenantRoleError when the caller lacks every allowed role", () => {
    expect(() =>
      requireTenantRole({ roles: ["viewer"] }, ["owner", "admin"]),
    ).toThrow(UnauthorizedTenantRoleError);
  });

  it("throws when the caller has no roles at all", () => {
    expect(() => requireTenantRole({ roles: [] }, ["owner"])).toThrow(
      UnauthorizedTenantRoleError,
    );
  });
});
