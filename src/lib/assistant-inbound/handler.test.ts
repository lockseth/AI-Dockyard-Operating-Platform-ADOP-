import { beforeEach, describe, expect, it, vi } from "vitest";

const completeOwnerAdminPairing = vi.fn();
const claimInboundAssistantEvent = vi.fn();
const recordInboundAssistantEventResult = vi.fn();
const countRecentInboundAssistantEvents = vi.fn();
const completeClientVerificationByAddress = vi.fn();

vi.mock("@/lib/assistant-identity/admin-repository", () => ({
  completeOwnerAdminPairing: (...args: unknown[]) => completeOwnerAdminPairing(...args),
}));

vi.mock("./repository", () => ({
  claimInboundAssistantEvent: (...args: unknown[]) => claimInboundAssistantEvent(...args),
  recordInboundAssistantEventResult: (...args: unknown[]) => recordInboundAssistantEventResult(...args),
  countRecentInboundAssistantEvents: (...args: unknown[]) => countRecentInboundAssistantEvents(...args),
  completeClientVerificationByAddress: (...args: unknown[]) => completeClientVerificationByAddress(...args),
}));

const BASE_ENVELOPE = {
  provider: "fonnte",
  providerMessageId: "wamid.1",
  channel: "whatsapp" as const,
  senderAddress: "+6281234567890",
  messageText: "PAIR ABCDEF",
  providerTimestamp: "2026-07-30T07:00:00.000Z",
};

describe("handleAssistantInboundEvent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    claimInboundAssistantEvent.mockResolvedValue({ eventId: "evt-1", isNew: true });
    countRecentInboundAssistantEvents.mockResolvedValue(0);
  });

  it("returns duplicate without calling any completion RPC when the claim reports isNew=false", async () => {
    claimInboundAssistantEvent.mockResolvedValue({ eventId: "evt-1", isNew: false });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent(BASE_ENVELOPE);

    expect(outcome.httpResult).toBe("duplicate");
    expect(outcome.reply).toEqual({ replyRequired: false, safeReplyCode: "duplicate", providerMessageId: "wamid.1" });
    expect(completeOwnerAdminPairing).not.toHaveBeenCalled();
    expect(completeClientVerificationByAddress).not.toHaveBeenCalled();
    expect(recordInboundAssistantEventResult).not.toHaveBeenCalled();
  });

  it("records ignored_unsupported_command and never calls a completion RPC for an unrecognized message", async () => {
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent({ ...BASE_ENVELOPE, messageText: "hello there" });

    expect(outcome.reply.safeReplyCode).toBe("ignored_unsupported_command");
    expect(outcome.reply.replyRequired).toBe(false);
    expect(completeOwnerAdminPairing).not.toHaveBeenCalled();
    expect(completeClientVerificationByAddress).not.toHaveBeenCalled();
    expect(recordInboundAssistantEventResult).toHaveBeenCalledWith({
      eventId: "evt-1",
      resultCode: "ignored_unsupported_command",
    });
  });

  it("rate-limits a PAIR command once the recent count exceeds the window threshold, without ever calling completion", async () => {
    countRecentInboundAssistantEvents.mockResolvedValue(999);
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent(BASE_ENVELOPE);

    expect(outcome.reply.safeReplyCode).toBe("rate_limited");
    expect(completeOwnerAdminPairing).not.toHaveBeenCalled();
    expect(recordInboundAssistantEventResult).toHaveBeenCalledWith({ eventId: "evt-1", resultCode: "rate_limited" });
  });

  it("maps a verified pairing outcome to safeReplyCode 'paired'", async () => {
    completeOwnerAdminPairing.mockResolvedValue({
      result: { outcome: "verified", identityId: "id-1", tenantId: "t-1", userId: "u-1", verifiedAt: "now" },
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent(BASE_ENVELOPE);

    expect(outcome.reply.safeReplyCode).toBe("paired");
    expect(completeOwnerAdminPairing).toHaveBeenCalledWith({
      channel: "whatsapp",
      normalizedAddress: "+6281234567890",
      code: "ABCDEF",
    });
  });

  it.each([
    ["invalid_code", "invalid_or_expired"],
    ["expired", "invalid_or_expired"],
    ["not_found", "invalid_or_expired"],
    ["membership_invalid", "invalid_or_expired"],
    ["locked", "locked"],
    ["ambiguous_binding", "ambiguous"],
  ])("collapses pairing outcome %s to safeReplyCode %s (no enumeration of the underlying reason)", async (rpcOutcome, expected) => {
    completeOwnerAdminPairing.mockResolvedValue({
      result: { outcome: rpcOutcome, identityId: null, tenantId: null, userId: null, verifiedAt: null },
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent(BASE_ENVELOPE);
    expect(outcome.reply.safeReplyCode).toBe(expected);
  });

  it("falls back to invalid_or_expired when completeOwnerAdminPairing itself errors (no result)", async () => {
    completeOwnerAdminPairing.mockResolvedValue({ error: "boom" });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent(BASE_ENVELOPE);
    expect(outcome.reply.safeReplyCode).toBe("invalid_or_expired");
  });

  it("dispatches a VERIFY command to completeClientVerificationByAddress, not the pairing RPC", async () => {
    completeClientVerificationByAddress.mockResolvedValue({
      outcome: "verified",
      contactId: "c-1",
      tenantId: "t-1",
      verifiedAt: "now",
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent({ ...BASE_ENVELOPE, messageText: "VERIFY 234HJK" });

    expect(outcome.reply.safeReplyCode).toBe("verified");
    expect(completeClientVerificationByAddress).toHaveBeenCalledWith({
      channel: "whatsapp",
      whatsappNumber: "+6281234567890",
      code: "234HJK",
    });
    expect(completeOwnerAdminPairing).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_or_expired", "invalid_or_expired"],
    ["contact_inactive", "invalid_or_expired"],
    ["duplicate_number", "invalid_or_expired"],
    ["locked", "locked"],
    ["ambiguous", "ambiguous"],
  ])("collapses verification outcome %s to safeReplyCode %s", async (rpcOutcome, expected) => {
    completeClientVerificationByAddress.mockResolvedValue({
      outcome: rpcOutcome,
      contactId: null,
      tenantId: null,
      verifiedAt: null,
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    const outcome = await handleAssistantInboundEvent({ ...BASE_ENVELOPE, messageText: "VERIFY 234HJK" });
    expect(outcome.reply.safeReplyCode).toBe(expected);
  });

  it("passes the claim a payload digest that never contains the message text itself", async () => {
    completeOwnerAdminPairing.mockResolvedValue({
      result: { outcome: "verified", identityId: "id-1", tenantId: "t-1", userId: "u-1", verifiedAt: "now" },
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    await handleAssistantInboundEvent(BASE_ENVELOPE);

    const claimArgs = claimInboundAssistantEvent.mock.calls[0][0];
    expect(claimArgs.payloadDigest).not.toMatch(/PAIR|ABCDEF/);
    expect(claimArgs.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records the final safeReplyCode as the result code for a successfully processed command", async () => {
    completeOwnerAdminPairing.mockResolvedValue({
      result: { outcome: "verified", identityId: "id-1", tenantId: "t-1", userId: "u-1", verifiedAt: "now" },
    });
    const { handleAssistantInboundEvent } = await import("./handler");

    await handleAssistantInboundEvent(BASE_ENVELOPE);

    expect(recordInboundAssistantEventResult).toHaveBeenCalledWith({ eventId: "evt-1", resultCode: "paired" });
  });
});
