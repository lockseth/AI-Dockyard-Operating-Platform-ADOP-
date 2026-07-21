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
