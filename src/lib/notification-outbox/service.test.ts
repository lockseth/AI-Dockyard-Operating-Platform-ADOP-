import { beforeEach, describe, expect, it, vi } from "vitest";

const claimNextNotificationEvent = vi.fn();
const completeNotificationEvent = vi.fn();
const failNotificationEvent = vi.fn();
const enqueueAndClaimMorningBriefNotification = vi.fn();
const resolveVerifiedOwnerRecipient = vi.fn();

vi.mock("./repository", () => ({
  claimNextNotificationEvent: (...args: unknown[]) => claimNextNotificationEvent(...args),
  completeNotificationEvent: (...args: unknown[]) => completeNotificationEvent(...args),
  failNotificationEvent: (...args: unknown[]) => failNotificationEvent(...args),
  enqueueAndClaimMorningBriefNotification: (...args: unknown[]) => enqueueAndClaimMorningBriefNotification(...args),
  resolveVerifiedOwnerRecipient: (...args: unknown[]) => resolveVerifiedOwnerRecipient(...args),
}));

describe("notification-outbox service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    claimNextNotificationEvent.mockReset();
    completeNotificationEvent.mockReset();
    failNotificationEvent.mockReset();
    enqueueAndClaimMorningBriefNotification.mockReset();
    resolveVerifiedOwnerRecipient.mockReset();
    vi.stubEnv("APP_URL", "https://adop.example.com");
  });

  it("returns null when nothing is claimable", async () => {
    claimNextNotificationEvent.mockResolvedValue(null);
    const { claimNextNotificationForDelivery } = await import("./service");

    const result = await claimNextNotificationForDelivery({ workerId: "w1" });
    expect(result).toBeNull();
    expect(resolveVerifiedOwnerRecipient).not.toHaveBeenCalled();
  });

  it("composes the review-requested message with the app-url-prefixed link, from trusted payload only", async () => {
    claimNextNotificationEvent.mockResolvedValue({
      id: "evt-1",
      tenant_id: "tenant-1",
      payload: {
        message_line1: "Pak Hanafi, ada hasil import kas yang menunggu pemeriksaan.",
        link_path: "/owner/review/cash-import/batch-1",
      },
    });
    resolveVerifiedOwnerRecipient.mockResolvedValue("+6281100000001");
    const { claimNextNotificationForDelivery } = await import("./service");

    const result = await claimNextNotificationForDelivery({ workerId: "w1" });
    expect(result).toEqual({
      id: "evt-1",
      message:
        "Pak Hanafi, ada hasil import kas yang menunggu pemeriksaan.\n\n" +
        "[Buka Review Transaksi] https://adop.example.com/owner/review/cash-import/batch-1",
      recipient: "+6281100000001",
    });
    expect(resolveVerifiedOwnerRecipient).toHaveBeenCalledWith("tenant-1");
  });

  it("composes the confirmation message with no link line when link_path is absent", async () => {
    claimNextNotificationEvent.mockResolvedValue({
      id: "evt-2",
      tenant_id: "tenant-1",
      payload: { message_line1: "Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP." },
    });
    resolveVerifiedOwnerRecipient.mockResolvedValue("+6281100000001");
    const { claimNextNotificationForDelivery } = await import("./service");

    const result = await claimNextNotificationForDelivery({ workerId: "w1" });
    expect(result).toEqual({
      id: "evt-2",
      message: "Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP.",
      recipient: "+6281100000001",
    });
  });

  it("fails the claim closed and returns null when no authorized recipient can be resolved — never a fallback number", async () => {
    claimNextNotificationEvent.mockResolvedValue({
      id: "evt-3",
      tenant_id: "tenant-1",
      payload: { message_line1: "Pak Hanafi, hasil import telah disetujui dan berhasil dicatat di ADOP." },
    });
    resolveVerifiedOwnerRecipient.mockResolvedValue(null);
    failNotificationEvent.mockResolvedValue({ status: "pending" });
    const { claimNextNotificationForDelivery } = await import("./service");

    const result = await claimNextNotificationForDelivery({ workerId: "w1" });
    expect(result).toBeNull();
    expect(failNotificationEvent).toHaveBeenCalledWith({
      eventId: "evt-3",
      workerId: "w1",
      error: "RECIPIENT_NOT_RESOLVED",
    });
  });

  it("maps a NOTIFICATION_CLAIM_MISMATCH error from complete into NotificationClaimMismatchError", async () => {
    // supabase-js rejects with a plain PostgrestError object shaped like
    // { code, details, hint, message } for a PL/pgSQL RAISE EXCEPTION — NOT
    // a real Error instance. Using a genuine `new Error(...)` here would
    // have hidden a real `instanceof Error` bug in isClaimMismatch.
    completeNotificationEvent.mockRejectedValue({
      code: "P0001",
      details: null,
      hint: null,
      message: "NOTIFICATION_CLAIM_MISMATCH",
    });
    const { completeNotificationDelivery, NotificationClaimMismatchError } = await import("./service");

    await expect(completeNotificationDelivery({ id: "evt-1", workerId: "w1" })).rejects.toBeInstanceOf(
      NotificationClaimMismatchError,
    );
  });

  it("maps a NOTIFICATION_CLAIM_MISMATCH error from fail into NotificationClaimMismatchError", async () => {
    failNotificationEvent.mockRejectedValue({
      code: "P0001",
      details: null,
      hint: null,
      message: "NOTIFICATION_CLAIM_MISMATCH",
    });
    const { failNotificationDelivery, NotificationClaimMismatchError } = await import("./service");

    await expect(failNotificationDelivery({ id: "evt-1", workerId: "w1", error: "timeout" })).rejects.toBeInstanceOf(
      NotificationClaimMismatchError,
    );
  });

  it("rethrows unrelated errors from complete/fail unchanged", async () => {
    completeNotificationEvent.mockRejectedValue({ code: "23505", details: null, hint: null, message: "some other db error" });
    const { completeNotificationDelivery, NotificationClaimMismatchError } = await import("./service");

    const promise = completeNotificationDelivery({ id: "evt-1", workerId: "w1" });
    await expect(promise).rejects.not.toBeInstanceOf(NotificationClaimMismatchError);
    await expect(promise).rejects.toMatchObject({ message: "some other db error" });
  });

  it("rethrows a rejection with no message property without crashing isClaimMismatch", async () => {
    completeNotificationEvent.mockRejectedValue(new TypeError("network down"));
    const { completeNotificationDelivery, NotificationClaimMismatchError } = await import("./service");

    const promise = completeNotificationDelivery({ id: "evt-1", workerId: "w1" });
    await expect(promise).rejects.not.toBeInstanceOf(NotificationClaimMismatchError);
    await expect(promise).rejects.toThrow("network down");
  });

  it("returns the resulting status on success", async () => {
    completeNotificationEvent.mockResolvedValue({ status: "sent" });
    const { completeNotificationDelivery } = await import("./service");

    await expect(completeNotificationDelivery({ id: "evt-1", workerId: "w1" })).resolves.toEqual({ status: "sent" });
  });

  describe("enqueueAndClaimMorningBriefDelivery", () => {
    it("reports claimedByThisCall=true when the row is processing under this exact worker id", async () => {
      enqueueAndClaimMorningBriefNotification.mockResolvedValue({
        id: "evt-mb-1",
        status: "processing",
        claimed_by: "worker-a",
      });
      const { enqueueAndClaimMorningBriefDelivery } = await import("./service");

      const result = await enqueueAndClaimMorningBriefDelivery({
        tenantId: "tenant-1",
        businessDate: "2026-07-31",
        workerId: "worker-a",
        messageLine1: "Ringkasan ADOP pagi ini.",
      });

      expect(result).toEqual({
        row: { id: "evt-mb-1", status: "processing", claimed_by: "worker-a" },
        claimedByThisCall: true,
      });
    });

    it("reports claimedByThisCall=false when another worker still holds an active claim", async () => {
      enqueueAndClaimMorningBriefNotification.mockResolvedValue({
        id: "evt-mb-1",
        status: "processing",
        claimed_by: "worker-a",
      });
      const { enqueueAndClaimMorningBriefDelivery } = await import("./service");

      const result = await enqueueAndClaimMorningBriefDelivery({
        tenantId: "tenant-1",
        businessDate: "2026-07-31",
        workerId: "worker-b",
        messageLine1: "Ringkasan ADOP pagi ini.",
      });

      expect(result.claimedByThisCall).toBe(false);
    });

    it("reports claimedByThisCall=false once the row is already sent (terminal)", async () => {
      enqueueAndClaimMorningBriefNotification.mockResolvedValue({
        id: "evt-mb-1",
        status: "sent",
        claimed_by: "worker-a",
      });
      const { enqueueAndClaimMorningBriefDelivery } = await import("./service");

      const result = await enqueueAndClaimMorningBriefDelivery({
        tenantId: "tenant-1",
        businessDate: "2026-07-31",
        workerId: "worker-a",
        messageLine1: "Ringkasan ADOP pagi ini.",
      });

      expect(result.claimedByThisCall).toBe(false);
    });
  });
});
