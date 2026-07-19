import { beforeEach, describe, expect, it, vi } from "vitest";

describe("health payload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("does not contain keys, tokens, or secrets", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret-value");
    vi.stubEnv("AI_API_KEY", "ai-secret-value");
    vi.stubEnv("WHATSAPP_API_TOKEN", "whatsapp-secret-value");
    vi.stubEnv("INTERNAL_API_SECRET", "internal-secret-value");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-secret-value");

    const { buildHealthPayload } = await import("./health");
    const payload = buildHealthPayload();
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/secret-value/i);
    expect(serialized).not.toMatch(/supabase\.co/i);
    expect(serialized).not.toMatch(/key/i);
    expect(serialized).not.toMatch(/token/i);

    expect(Object.keys(payload).sort()).toEqual(
      ["APP_ENV", "application", "integrations", "status", "timestamp"].sort(),
    );
    expect(Object.keys(payload.integrations).sort()).toEqual(
      ["ai", "supabase", "whatsapp"].sort(),
    );
  });
});
