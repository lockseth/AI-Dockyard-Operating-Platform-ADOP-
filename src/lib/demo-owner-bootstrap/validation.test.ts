import { describe, expect, it } from "vitest";
import { ownerBootstrapIdentitySchema, ownerIdentityFieldsSchema } from "./validation";

const VALID = {
  email: "founder-demo@example.test",
  displayName: "Founder Demo Owner",
  password: "Correct-Horse-9",
};

describe("ownerIdentityFieldsSchema — dry-run (no password)", () => {
  it("accepts email + displayName with no password field at all", () => {
    const result = ownerIdentityFieldsSchema.safeParse({
      email: VALID.email,
      displayName: VALID.displayName,
    });
    expect(result.success).toBe(true);
  });

  it("does not carry a password through even if one is passed in", () => {
    const result = ownerIdentityFieldsSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.hasOwn(result.data, "password")).toBe(false);
    }
  });

  it("rejects an invalid email the same way the apply schema does", () => {
    const result = ownerIdentityFieldsSchema.safeParse({
      email: "not-an-email",
      displayName: VALID.displayName,
    });
    expect(result.success).toBe(false);
  });
});

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

  it("rejects a missing password (apply still requires one)", () => {
    const withoutPassword = { email: VALID.email, displayName: VALID.displayName };
    const result = ownerBootstrapIdentitySchema.safeParse(withoutPassword);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("password"))).toBe(true);
    }
  });

  it("rejects an empty display name", () => {
    const result = ownerBootstrapIdentitySchema.safeParse({ ...VALID, displayName: "  " });
    expect(result.success).toBe(false);
  });
});
