import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const completeNotificationDelivery = vi.fn();

class FakeNotificationClaimMismatchError extends Error {}

vi.mock("@/lib/notification-outbox/service", () => ({
  completeNotificationDelivery: (...args: unknown[]) => completeNotificationDelivery(...args),
  NotificationClaimMismatchError: FakeNotificationClaimMismatchError,
}));

const VALID_ID = "11111111-1111-4111-8111-111111111111";

function buildRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/internal/notifications/complete", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/internal/notifications/complete", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    completeNotificationDelivery.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", "top-secret-value");
  });

  it("rejects a missing/wrong secret with 401", async () => {
    const { POST } = await import("./route");
    const missing = await POST(buildRequest({ id: VALID_ID, workerId: "w1" }));
    expect(missing.status).toBe(401);

    const wrong = await POST(buildRequest({ id: VALID_ID, workerId: "w1" }, { "x-internal-secret": "nope" }));
    expect(wrong.status).toBe(401);

    expect(completeNotificationDelivery).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload (non-uuid id) with 400", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({ id: "not-a-uuid", workerId: "w1" }, { "x-internal-secret": "top-secret-value" }),
    );
    expect(response.status).toBe(400);
  });

  it("maps a claim mismatch into 409", async () => {
    completeNotificationDelivery.mockRejectedValue(new FakeNotificationClaimMismatchError());
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest({ id: VALID_ID, workerId: "w1" }, { "x-internal-secret": "top-secret-value" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "NOTIFICATION_CLAIM_MISMATCH" });
  });

  it("returns the resulting status on success", async () => {
    completeNotificationDelivery.mockResolvedValue({ status: "sent" });
    const { POST } = await import("./route");
    const response = await POST(
      buildRequest(
        { id: VALID_ID, workerId: "w1", providerMessageId: "fonnte-1" },
        { "x-internal-secret": "top-secret-value" },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "sent" });
    expect(completeNotificationDelivery).toHaveBeenCalledWith({
      id: VALID_ID,
      workerId: "w1",
      providerMessageId: "fonnte-1",
    });
  });
});
