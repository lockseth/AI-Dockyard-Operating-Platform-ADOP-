import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const claimNextNotificationForDelivery = vi.fn();

vi.mock("@/lib/notification-outbox/service", () => ({
  claimNextNotificationForDelivery: (...args: unknown[]) => claimNextNotificationForDelivery(...args),
}));

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/internal/notifications/claim", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/internal/notifications/claim", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    claimNextNotificationForDelivery.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", "top-secret-value");
  });

  it("rejects a missing secret header with 401 and never calls the service", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }));

    expect(response.status).toBe(401);
    expect(claimNextNotificationForDelivery).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret with 401", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "wrong" }));

    expect(response.status).toBe(401);
    expect(claimNextNotificationForDelivery).not.toHaveBeenCalled();
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
    expect(claimNextNotificationForDelivery).not.toHaveBeenCalled();
  });

  it("never accepts a tenantId in the body — the schema has no such field, so it is silently dropped, not honored", async () => {
    claimNextNotificationForDelivery.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({ workerId: "n8n-1", tenantId: "forged-tenant" }, { "x-internal-secret": "top-secret-value" }),
    );

    expect(response.status).toBe(200);
    expect(claimNextNotificationForDelivery).toHaveBeenCalledWith({ workerId: "n8n-1" });
  });

  it("returns the claimed event on success with a correct secret", async () => {
    claimNextNotificationForDelivery.mockResolvedValue({ id: "evt-1", message: "hello" });
    const { POST } = await import("./route");
    const response = await POST(buildRequest({ workerId: "n8n-1" }, { "x-internal-secret": "top-secret-value" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ event: { id: "evt-1", message: "hello" } });
  });
});
