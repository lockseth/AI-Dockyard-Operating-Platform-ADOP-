import { describe, expect, it } from "vitest";
import { canAccessOwnerWhatsappRegistration } from "./access";

describe("canAccessOwnerWhatsappRegistration", () => {
  it("allows owner", () => {
    expect(canAccessOwnerWhatsappRegistration(["owner"])).toBe(true);
  });

  it("denies admin", () => {
    expect(canAccessOwnerWhatsappRegistration(["admin"])).toBe(false);
  });

  it("denies reviewer", () => {
    expect(canAccessOwnerWhatsappRegistration(["reviewer"])).toBe(false);
  });

  it("denies viewer", () => {
    expect(canAccessOwnerWhatsappRegistration(["viewer"])).toBe(false);
  });

  it("denies no roles", () => {
    expect(canAccessOwnerWhatsappRegistration([])).toBe(false);
  });

  it("allows a membership that also carries admin, as long as owner is present", () => {
    expect(canAccessOwnerWhatsappRegistration(["owner", "admin"])).toBe(true);
  });
});
