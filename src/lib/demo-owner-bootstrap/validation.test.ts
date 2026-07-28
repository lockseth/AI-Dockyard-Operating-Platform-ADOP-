import { describe, expect, it } from "vitest";
import { ownerBootstrapIdentitySchema } from "./validation";

const VALID = {
  email: "founder-demo@example.test",
  displayName: "Founder Demo Owner",
  password: "Correct-Horse-9",
};

describe("ownerBootstrapIdentitySchema", () => {
  it("accepts a valid identity and lowercases the email", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({
      ...VALID,
      email: "Founder-Demo@Example.TEST",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("founder-demo@example.test");
    }
  });

  it("rejects an invalid email", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({ ...VALID, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a display name containing the forbidden literal", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({
      ...VALID,
      displayName: "Pak Hanafi",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("displayName"))).toBe(true);
    }
  });

  it("rejects a short password", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({ ...VALID, password: "short1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password without a digit", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({
      ...VALID,
      password: "NoDigitsAtAllHere",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty display name", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({ ...VALID, displayName: "  " });
    expect(result.success).toBe(false);
  });
});
