import { describe, expect, it } from "vitest";
import { GENERIC_LOGIN_ERROR, loginFormSchema } from "./validation";

describe("loginFormSchema", () => {
  it("accepts a valid email/password pair", () => {
    const result = loginFormSchema.safeParse({
      email: "user@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginFormSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginFormSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing form fields (FormData.get returning null)", () => {
    const result = loginFormSchema.safeParse({ email: null, password: null });
    expect(result.success).toBe(false);
  });
});

describe("GENERIC_LOGIN_ERROR", () => {
  it("never hints at which field (email vs password) was wrong", () => {
    const lower = GENERIC_LOGIN_ERROR.toLowerCase();
    expect(lower).not.toContain("tidak ditemukan");
    expect(lower).not.toContain("salah satu");
    expect(lower).not.toContain("password anda salah");
  });
});
