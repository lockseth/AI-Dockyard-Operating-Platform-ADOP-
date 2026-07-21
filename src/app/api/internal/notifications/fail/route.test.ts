import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const failNotificationDelivery = vi.fn();

class FakeNotificationClaimMismatchError extends Error {}

vi.mock("@/lib/notification-outbox/service", () => ({
  failNotificationDelivery: (...args: unknown[]) => failNotificationDelivery(...args),
  NotificationClaimMismatchError: FakeNotificationClaimMismatchError,
}));

const VALID_ID = "11111111-1111-4111-8111-111111111111";

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/internal/notifications/fail", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/internal/notifications/fail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    failNotificationDelivery.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", "top-secret-value");
  });

  it("rejects a missing/wrong secret with 401", async () => {
    const { POST } = await import("./route");
    const missing = await POST(buildRequest({ id: VALID_ID, workerId: "w1", error: "timeout" }));
    expect(missing.status).toBe(401);

    const wrong = await POST(
      buildRequest({ id: VALID_ID, workerId: "w1", error: "timeout" }, { "x-internal-secret": "nope" }),
    );
    expect(wrong.status).toBe(401);

    expect(failNotificationDelivery).not.toHaveBeenCalled();
  });

  it("rejects an empty error message with 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({ id: VALID_ID, workerId: "w1", error: "" }, { "x-internal-secret": "top-secret-value" }),
    );
    expect(response.status).toBe(400);
  });

  it("maps a claim mismatch into 409", async () => {
    failNotificationDelivery.mockRejectedValue(new FakeNotificationClaimMismatchError());
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest(
        { id: VALID_ID, workerId: "w1", error: "fonnte timeout" },
        { "x-internal-secret": "top-secret-value" },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "NOTIFICATION_CLAIM_MISMATCH" });
  });

  it("returns the resulting status on success", async () => {
    failNotificationDelivery.mockResolvedValue({ status: "pending" });
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest(
        { id: VALID_ID, workerId: "w1", error: "fonnte timeout" },
        { "x-internal-secret": "top-secret-value" },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "pending" });
  });
});
