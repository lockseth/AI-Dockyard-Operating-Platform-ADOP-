import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const previewMorningBrief = vi.fn();
const composeAndEnqueueMorningBrief = vi.fn();

vi.mock("@/lib/morning-brief/service", () => ({
  previewMorningBrief: (...args: unknown[]) => previewMorningBrief(...args),
  composeAndEnqueueMorningBrief: (...args: unknown[]) => composeAndEnqueueMorningBrief(...args),
}));

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/internal/morning-brief", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/internal/morning-brief", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    previewMorningBrief.mockReset();
    composeAndEnqueueMorningBrief.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", "top-secret-value");
  });

  it("rejects a missing secret header with 401 and never calls the service", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }));

    expect(response.status).toBe(401);
    expect(previewMorningBrief).not.toHaveBeenCalled();
    expect(composeAndEnqueueMorningBrief).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "wrong" }));

    expect(response.status).toBe(401);
  });

  it("rejects every request when INTERNAL_API_SECRET is unconfigured, even a header of the empty string", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "" }));

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload with 400 even with a correct secret", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "" }, { "x-internal-secret": "top-secret-value" }));

    expect(response.status).toBe(400);
    expect(composeAndEnqueueMorningBrief).not.toHaveBeenCalled();
  });

  it("never accepts a tenantId in the body — silently dropped, not honored", async () => {
    composeAndEnqueueMorningBrief.mockResolvedValue({ status: "duplicate", businessDate: "2026-07-31" });
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({ workerId: "n8n-1", tenantId: "forged-tenant" }, { "x-internal-secret": "top-secret-value" }),
    );

    expect(response.status).toBe(200);
    expect(composeAndEnqueueMorningBrief).toHaveBeenCalledWith({ workerId: "n8n-1", leaseSeconds: undefined });
  });

  describe("dryRun=true", () => {
    it("returns a preview and never calls the enqueue path", async () => {
      previewMorningBrief.mockResolvedValue({
        status: "ok",
        businessDate: "2026-07-31",
        message: "Ringkasan ADOP pagi ini.",
      });
      const { POST } = await import("./route");
      const response = await POST(
        buildRequest({ workerId: "n8n-1", dryRun: true }, { "x-internal-secret": "top-secret-value" }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        preview: true,
        businessDate: "2026-07-31",
        message: "Ringkasan ADOP pagi ini.",
      });
      expect(composeAndEnqueueMorningBrief).not.toHaveBeenCalled();
    });

    it("returns 503 when the pilot tenant is unconfigured/inactive", async () => {
      previewMorningBrief.mockResolvedValue({ status: "pilot_tenant_unavailable" });
      const { POST } = await import("./route");
      const response = await POST(
        buildRequest({ workerId: "n8n-1", dryRun: true }, { "x-internal-secret": "top-secret-value" }),
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "PILOT_TENANT_UNAVAILABLE" });
    });
  });

  describe("dryRun=false (default)", () => {
    it("returns the claimed event on a fresh claim", async () => {
      composeAndEnqueueMorningBrief.mockResolvedValue({
        status: "claimed",
        businessDate: "2026-07-31",
        event: { id: "evt-mb-1", message: "Ringkasan ADOP pagi ini." },
      });
      const { POST } = await import("./route");
      const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "top-secret-value" }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        event: { id: "evt-mb-1", message: "Ringkasan ADOP pagi ini." },
        businessDate: "2026-07-31",
      });
    });

    it("returns event: null with duplicate: true when today's brief is already in flight or sent", async () => {
      composeAndEnqueueMorningBrief.mockResolvedValue({ status: "duplicate", businessDate: "2026-07-31" });
      const { POST } = await import("./route");
      const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "top-secret-value" }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        event: null,
        duplicate: true,
        businessDate: "2026-07-31",
      });
    });

    it("returns 503 when the pilot tenant is unconfigured/inactive", async () => {
      composeAndEnqueueMorningBrief.mockResolvedValue({ status: "pilot_tenant_unavailable" });
      const { POST } = await import("./route");
      const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "top-secret-value" }));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "PILOT_TENANT_UNAVAILABLE" });
    });
  });
});
