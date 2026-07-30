import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const handleAssistantInboundEvent = vi.fn();

vi.mock("@/lib/assistant-inbound/handler", () => ({
  handleAssistantInboundEvent: (...args: unknown[]) => handleAssistantInboundEvent(...args),
}));

const INTERNAL_SECRET = "top-secret-value";
const SIGNING_SECRET = "hmac-signing-secret";

function sign(timestamp: string, rawBody: string): string {
  return createHmac("sha256", SIGNING_SECRET).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

function buildRequest(
  rawBody: string,
  headers: Record<string, string> = {},
  options: { signed?: boolean; timestamp?: number } = {},
): NextRequest {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const finalHeaders: Record<string, string> = { "content-type": "application/json", ...headers };
  if (options.signed !== false) {
    finalHeaders["x-internal-secret"] = finalHeaders["x-internal-secret"] ?? INTERNAL_SECRET;
    finalHeaders["x-assistant-signature-timestamp"] = String(timestamp);
    finalHeaders["x-assistant-signature"] = sign(String(timestamp), rawBody);
  }
  return new NextRequest("http://localhost/api/internal/assistant/inbound", {
    method: "POST",
    headers: finalHeaders,
    body: rawBody,
  });
}

// providerTimestamp is Unix seconds — Gate 6J-C1's verified Fonnte capture,
// not the previously-assumed ISO-8601 string.
const VALID_ENVELOPE = {
  provider: "fonnte",
  providerMessageId: "fonnte:inbox:482913",
  channel: "whatsapp",
  senderAddress: "+6281234567890",
  messageText: "PAIR ABCDEF",
  providerTimestamp: "1783148400",
};

describe("POST /api/internal/assistant/inbound", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    handleAssistantInboundEvent.mockReset();
    vi.stubEnv("INTERNAL_API_SECRET", INTERNAL_SECRET);
    vi.stubEnv("INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET", SIGNING_SECRET);
  });

  it("rejects a request over the body size limit before any auth check", async () => {
    const { POST } = await import("./route");
    const oversized = JSON.stringify({ ...VALID_ENVELOPE, messageText: "a".repeat(20_000) });
    const response = await POST(buildRequest(oversized, {}, { signed: false }));

    expect(response.status).toBe(400);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects a non-application/json content-type", async () => {
    const rawBody = JSON.stringify(VALID_ENVELOPE);
    const { POST } = await import("./route");
    const response = await POST(buildRequest(rawBody, { "content-type": "text/plain" }, { signed: false }));

    expect(response.status).toBe(400);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing x-internal-secret header with 401 before ever checking the signature", async () => {
    const rawBody = JSON.stringify(VALID_ENVELOPE);
    const { POST } = await import("./route");
    const response = await POST(buildRequest(rawBody, {}, { signed: false }));

    expect(response.status).toBe(401);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects a correct x-internal-secret but missing/invalid HMAC signature with 401 (both layers required)", async () => {
    const rawBody = JSON.stringify(VALID_ENVELOPE);
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/assistant/inbound", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(401);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects a signature computed over a different body than the one delivered — no DB mutation happens", async () => {
    const rawBody = JSON.stringify(VALID_ENVELOPE);
    const timestamp = Math.floor(Date.now() / 1000);
    const wrongSignature = sign(String(timestamp), JSON.stringify({ ...VALID_ENVELOPE, providerMessageId: "tampered" }));

    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("http://localhost/api/internal/assistant/inbound", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
          "x-assistant-signature-timestamp": String(timestamp),
          "x-assistant-signature": wrongSignature,
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(401);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON even with a fully valid signature/secret", async () => {
    const rawBody = "{not valid json";
    const { POST } = await import("./route");
    const response = await POST(buildRequest(rawBody));

    expect(response.status).toBe(400);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("rejects a well-formed JSON body that fails envelope validation", async () => {
    const rawBody = JSON.stringify({ ...VALID_ENVELOPE, channel: "telegram" });
    const { POST } = await import("./route");
    const response = await POST(buildRequest(rawBody));

    expect(response.status).toBe(400);
    expect(handleAssistantInboundEvent).not.toHaveBeenCalled();
  });

  it("dispatches to handleAssistantInboundEvent and returns its outcome when every gate passes", async () => {
    handleAssistantInboundEvent.mockResolvedValue({
      httpResult: "processed",
      reply: { replyRequired: true, safeReplyCode: "paired", providerMessageId: "fonnte:inbox:482913" },
    });
    const rawBody = JSON.stringify(VALID_ENVELOPE);
    const { POST } = await import("./route");
    const response = await POST(buildRequest(rawBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: "processed",
      reply: { replyRequired: true, safeReplyCode: "paired", providerMessageId: "fonnte:inbox:482913" },
    });
    expect(handleAssistantInboundEvent).toHaveBeenCalledTimes(1);
  });

  it("never accepts a forged tenantId field in the body — it is dropped before reaching the handler", async () => {
    handleAssistantInboundEvent.mockResolvedValue({
      httpResult: "processed",
      reply: { replyRequired: true, safeReplyCode: "paired", providerMessageId: "fonnte:inbox:482913" },
    });
    const rawBody = JSON.stringify({ ...VALID_ENVELOPE, tenantId: "forged-tenant" });
    const { POST } = await import("./route");
    await POST(buildRequest(rawBody));

    const calledWith = handleAssistantInboundEvent.mock.calls[0][0];
    expect(calledWith).not.toHaveProperty("tenantId");
  });
});
