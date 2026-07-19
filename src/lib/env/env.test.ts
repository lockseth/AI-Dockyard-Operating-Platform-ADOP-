import { beforeEach, describe, expect, it, vi } from "vitest";

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("accepts unconfigured AI/WhatsApp/Supabase without throwing", async () => {
    vi.stubEnv("WHATSAPP_PROVIDER", "unconfigured");
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).not.toThrow();
    expect(getServerEnv().WHATSAPP_PROVIDER).toBe("unconfigured");

    const { getIntegrationStatus } = await import("./status");
    expect(getIntegrationStatus()).toEqual({
      supabase: "unconfigured",
      ai: "unconfigured",
      whatsapp: "unconfigured",
    });
  });

  it("treats template placeholder values (e.g. <isi-...>) as unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "<isi-dari-`supabase-status`>",
    );
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "<isi-dari-`supabase-status`>",
    );

    const { getIntegrationStatus } = await import("./status");
    expect(getIntegrationStatus().supabase).toBe("unconfigured");
  });

  it("accepts Asia/Jakarta as APP_TIMEZONE", async () => {
    vi.stubEnv("APP_TIMEZONE", "Asia/Jakarta");

    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).not.toThrow();
    expect(getServerEnv().APP_TIMEZONE).toBe("Asia/Jakarta");
  });

  it("rejects an invalid IANA timezone", async () => {
    vi.stubEnv("APP_TIMEZONE", "Not/A_Real_Zone");

    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow();
  });

  it("rejects an invalid LOG_LEVEL", async () => {
    vi.stubEnv("LOG_LEVEL", "verbose");

    const { getServerEnv } = await import("./server");
    expect(() => getServerEnv()).toThrow();
  });

  it("does not expose APP_URL (or any server var) on the public env object", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");

    const { publicEnv } = await import("./public");
    expect(publicEnv).not.toHaveProperty("APP_URL");
  });

  it("does not expose server secrets on the public env object", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret-value");
    vi.stubEnv("AI_API_KEY", "ai-secret-value");
    vi.stubEnv("INTERNAL_API_SECRET", "internal-secret-value");
    vi.stubEnv("WHATSAPP_API_TOKEN", "whatsapp-secret-value");

    const { publicEnv } = await import("./public");
    const serialized = JSON.stringify(publicEnv);

    expect(serialized).not.toContain("secret-value");
    expect(publicEnv).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(publicEnv).not.toHaveProperty("AI_API_KEY");
    expect(publicEnv).not.toHaveProperty("INTERNAL_API_SECRET");
    expect(publicEnv).not.toHaveProperty("WHATSAPP_API_TOKEN");
  });
});
