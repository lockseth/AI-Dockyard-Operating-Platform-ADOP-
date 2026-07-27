import { describe, expect, it } from "vitest";
import { canAccessBillingWorkspace } from "./access";

describe("canAccessBillingWorkspace", () => {
  it("allows owner and admin", () => {
    expect(canAccessBillingWorkspace(["owner"])).toBe(true);
    expect(canAccessBillingWorkspace(["admin"])).toBe(true);
  });

  it("rejects reviewer and viewer — same gate as Invoice & Evidence", () => {
    expect(canAccessBillingWorkspace(["reviewer"])).toBe(false);
    expect(canAccessBillingWorkspace(["viewer"])).toBe(false);
  });

  it("rejects a user with no roles", () => {
    expect(canAccessBillingWorkspace([])).toBe(false);
  });
});
