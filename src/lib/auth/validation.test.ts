import { describe, expect, it } from "vitest";
import {
  GENERIC_LOGIN_ERROR,
  GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE,
  forgotPasswordFormSchema,
  isAllowedPostAuthRedirect,
  loginFormSchema,
  setPasswordFormSchema,
} from "./validation";

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

describe("forgotPasswordFormSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordFormSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordFormSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE", () => {
  it("never hints at whether the email was found", () => {
    const lower = GENERIC_PASSWORD_RESET_REQUESTED_MESSAGE.toLowerCase();
    expect(lower).not.toContain("tidak terdaftar");
    expect(lower).not.toContain("ditemukan");
  });
});

describe("setPasswordFormSchema", () => {
  it("accepts matching passwords of sufficient length", () => {
    const result = setPasswordFormSchema.safeParse({
      password: "correcthorse",
      confirmPassword: "correcthorse",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = setPasswordFormSchema.safeParse({ password: "short1", confirmPassword: "short1" });
    expect(result.success).toBe(false);
  });

  it("rejects a mismatched confirmation", () => {
    const result = setPasswordFormSchema.safeParse({
      password: "correcthorse",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
  });
});

describe("isAllowedPostAuthRedirect", () => {
  it("allows the known invite/reset paths", () => {
    expect(isAllowedPostAuthRedirect("/reset-password")).toBe(true);
    expect(isAllowedPostAuthRedirect("/invite/accept")).toBe(true);
  });

  it("rejects anything not on the allowlist, including absolute URLs", () => {
    expect(isAllowedPostAuthRedirect(null)).toBe(false);
    expect(isAllowedPostAuthRedirect("/app")).toBe(false);
    expect(isAllowedPostAuthRedirect("https://evil.example.com")).toBe(false);
    expect(isAllowedPostAuthRedirect("//evil.example.com")).toBe(false);
  });
});
