import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

// Regression test: PostgREST serializes a SQL NULL composite return (e.g.
// claim_next_notification_event finding nothing to claim) as an object with
// every field set to null — {"id": null, "tenant_id": null, ...} — never a
// bare JSON null. A naive `data ?? null` / `if (!data)` check treats that
// object as truthy and leaks an all-null "claimed" row to callers, which
// silently breaks both drain/exhaustion loops and null-checks downstream.
describe("claimNextNotificationEvent", () => {
  it("returns null when PostgREST returns an all-null composite (nothing claimable)", async () => {
    rpc.mockResolvedValue({
      data: {
        id: null,
        tenant_id: null,
        event_type: null,
        channel: null,
        subject_type: null,
        subject_id: null,
        source_event_id: null,
        payload: null,
        status: null,
        attempt_count: null,
        max_attempts: null,
        claimed_by: null,
        claimed_at: null,
        lease_expires_at: null,
        provider_message_id: null,
        last_error: null,
        sent_at: null,
        created_at: null,
        updated_at: null,
      },
      error: null,
    });
    const { claimNextNotificationEvent } = await import("./repository");

    await expect(claimNextNotificationEvent("worker-1")).resolves.toBeNull();
  });

  it("returns the row when a real notification was claimed", async () => {
    rpc.mockResolvedValue({ data: { id: "evt-1", status: "processing" }, error: null });
    const { claimNextNotificationEvent } = await import("./repository");

    await expect(claimNextNotificationEvent("worker-1")).resolves.toEqual({ id: "evt-1", status: "processing" });
  });

  it("throws on an RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("db unavailable") });
    const { claimNextNotificationEvent } = await import("./repository");

    await expect(claimNextNotificationEvent("worker-1")).rejects.toThrow("db unavailable");
  });
});

describe("resolveVerifiedOwnerRecipient", () => {
  it("calls the RPC with the exact p_-prefixed argument name the migration defines", async () => {
    rpc.mockResolvedValue({ data: "+6281100000001", error: null });
    const { resolveVerifiedOwnerRecipient } = await import("./repository");

    await resolveVerifiedOwnerRecipient("tenant-1");

    expect(rpc).toHaveBeenCalledWith("resolve_verified_owner_recipient", { p_tenant_id: "tenant-1" });
  });

  it("returns the resolved recipient on success", async () => {
    rpc.mockResolvedValue({ data: "+6281100000001", error: null });
    const { resolveVerifiedOwnerRecipient } = await import("./repository");

    await expect(resolveVerifiedOwnerRecipient("tenant-1")).resolves.toBe("+6281100000001");
  });

  it("returns null when the RPC resolves nothing (zero or ambiguous candidates)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { resolveVerifiedOwnerRecipient } = await import("./repository");

    await expect(resolveVerifiedOwnerRecipient("tenant-1")).resolves.toBeNull();
  });

  it("throws on an RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("db unavailable") });
    const { resolveVerifiedOwnerRecipient } = await import("./repository");

    await expect(resolveVerifiedOwnerRecipient("tenant-1")).rejects.toThrow("db unavailable");
  });
});

describe("enqueueAndClaimMorningBriefNotification", () => {
  it("calls the RPC with the exact p_-prefixed argument names the migration defines", async () => {
    rpc.mockResolvedValue({ data: { id: "evt-mb-1", status: "processing" }, error: null });
    const { enqueueAndClaimMorningBriefNotification } = await import("./repository");

    await enqueueAndClaimMorningBriefNotification({
      tenantId: "tenant-1",
      businessDate: "2026-07-31",
      workerId: "worker-a",
      messageLine1: "Ringkasan ADOP pagi ini.",
      linkPath: "/app/executive-report",
      leaseSeconds: 300,
    });

    expect(rpc).toHaveBeenCalledWith("enqueue_and_claim_morning_brief_notification", {
      p_tenant_id: "tenant-1",
      p_business_date: "2026-07-31",
      p_worker_id: "worker-a",
      p_message_line1: "Ringkasan ADOP pagi ini.",
      p_link_path: "/app/executive-report",
      p_lease_seconds: 300,
    });
  });

  it("returns the row on success", async () => {
    rpc.mockResolvedValue({ data: { id: "evt-mb-1", status: "processing", claimed_by: "worker-a" }, error: null });
    const { enqueueAndClaimMorningBriefNotification } = await import("./repository");

    await expect(
      enqueueAndClaimMorningBriefNotification({
        tenantId: "tenant-1",
        businessDate: "2026-07-31",
        workerId: "worker-a",
        messageLine1: "Ringkasan ADOP pagi ini.",
      }),
    ).resolves.toEqual({ id: "evt-mb-1", status: "processing", claimed_by: "worker-a" });
  });

  it("throws on an RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("db unavailable") });
    const { enqueueAndClaimMorningBriefNotification } = await import("./repository");

    await expect(
      enqueueAndClaimMorningBriefNotification({
        tenantId: "tenant-1",
        businessDate: "2026-07-31",
        workerId: "worker-a",
        messageLine1: "Ringkasan ADOP pagi ini.",
      }),
    ).rejects.toThrow("db unavailable");
  });
});
