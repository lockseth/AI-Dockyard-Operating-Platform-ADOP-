import { beforeEach, describe, expect, it, vi } from "vitest";

describe("activeTenantCookieOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("is httpOnly, sameSite=lax, path=/ and not secure on APP_ENV=local", async () => {
    vi.stubEnv("APP_ENV", "local");
    const { activeTenantCookieOptions } = await import("./cookies");

    expect(activeTenantCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });

  it("is secure outside local development (e.g. APP_ENV=production)", async () => {
    vi.stubEnv("APP_ENV", "production");
    const { activeTenantCookieOptions } = await import("./cookies");

    expect(activeTenantCookieOptions().secure).toBe(true);
  });

  it("defaults APP_ENV to local (secure=false) when unset", async () => {
    const { activeTenantCookieOptions } = await import("./cookies");

    expect(activeTenantCookieOptions().secure).toBe(false);
  });
});
