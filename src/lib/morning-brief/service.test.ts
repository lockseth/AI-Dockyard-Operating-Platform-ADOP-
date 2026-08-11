import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePilotTenant = vi.fn();
const getExecutiveReportSummaryForTenant = vi.fn();
const composeMorningBrief = vi.fn();
const enqueueAndClaimMorningBriefDelivery = vi.fn();
const resolveVerifiedOwnerRecipient = vi.fn();

vi.mock("./repository", () => ({
  resolvePilotTenant: (...args: unknown[]) => resolvePilotTenant(...args),
}));
vi.mock("./read-model", () => ({
  getExecutiveReportSummaryForTenant: (...args: unknown[]) => getExecutiveReportSummaryForTenant(...args),
}));
vi.mock("./composer", () => ({
  composeMorningBrief: (...args: unknown[]) => composeMorningBrief(...args),
}));
vi.mock("@/lib/notification-outbox/service", () => ({
  enqueueAndClaimMorningBriefDelivery: (...args: unknown[]) => enqueueAndClaimMorningBriefDelivery(...args),
  resolveVerifiedOwnerRecipient: (...args: unknown[]) => resolveVerifiedOwnerRecipient(...args),
}));

const FIXED_NOW = new Date("2026-07-31T01:00:00.000Z"); // 08:00 WIB

describe("previewMorningBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    resolvePilotTenant.mockReset();
    getExecutiveReportSummaryForTenant.mockReset();
    composeMorningBrief.mockReset();
    enqueueAndClaimMorningBriefDelivery.mockReset();
  });

  it("returns pilot_tenant_unavailable and never reads business data when the pilot tenant cannot be resolved", async () => {
    resolvePilotTenant.mockResolvedValue(null);
    const { previewMorningBrief } = await import("./service");

    await expect(previewMorningBrief(FIXED_NOW)).resolves.toEqual({ status: "pilot_tenant_unavailable" });
    expect(getExecutiveReportSummaryForTenant).not.toHaveBeenCalled();
  });

  it("composes a preview without ever calling the outbox", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({ activeProjectCount: 1 });
    composeMorningBrief.mockReturnValue("Ringkasan ADOP pagi ini.");
    const { previewMorningBrief } = await import("./service");

    const result = await previewMorningBrief(FIXED_NOW);

    expect(result).toEqual({ status: "ok", businessDate: "2026-07-31", message: "Ringkasan ADOP pagi ini." });
    expect(enqueueAndClaimMorningBriefDelivery).not.toHaveBeenCalled();
  });

  it("resolves the business date from Asia/Jakarta, not UTC", async () => {
    // 2026-07-31T20:30:00Z is already 2026-08-01 03:30 in Jakarta (UTC+7).
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("x");
    const { previewMorningBrief } = await import("./service");

    const result = await previewMorningBrief(new Date("2026-07-31T20:30:00.000Z"));

    expect(result).toMatchObject({ businessDate: "2026-08-01" });
  });
});

describe("composeAndEnqueueMorningBrief", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    resolvePilotTenant.mockReset();
    getExecutiveReportSummaryForTenant.mockReset();
    composeMorningBrief.mockReset();
    enqueueAndClaimMorningBriefDelivery.mockReset();
    resolveVerifiedOwnerRecipient.mockReset();
  });

  it("returns pilot_tenant_unavailable and never calls the outbox when the pilot tenant cannot be resolved", async () => {
    resolvePilotTenant.mockResolvedValue(null);
    const { composeAndEnqueueMorningBrief } = await import("./service");

    await expect(composeAndEnqueueMorningBrief({ workerId: "worker-a", now: FIXED_NOW })).resolves.toEqual({
      status: "pilot_tenant_unavailable",
    });
    expect(enqueueAndClaimMorningBriefDelivery).not.toHaveBeenCalled();
    expect(resolveVerifiedOwnerRecipient).not.toHaveBeenCalled();
  });

  it("returns recipient_unavailable and never enqueues/claims when no single verified owner recipient can be resolved", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("Ringkasan ADOP pagi ini.");
    resolveVerifiedOwnerRecipient.mockResolvedValue(null);
    const { composeAndEnqueueMorningBrief } = await import("./service");

    await expect(composeAndEnqueueMorningBrief({ workerId: "worker-a", now: FIXED_NOW })).resolves.toEqual({
      status: "recipient_unavailable",
      businessDate: "2026-07-31",
    });
    expect(resolveVerifiedOwnerRecipient).toHaveBeenCalledWith("tenant-1");
    expect(enqueueAndClaimMorningBriefDelivery).not.toHaveBeenCalled();
  });

  it("resolves the recipient from the composed tenant, strictly before attempting to enqueue/claim", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("Ringkasan ADOP pagi ini.");
    const callOrder: string[] = [];
    resolveVerifiedOwnerRecipient.mockImplementation(async () => {
      callOrder.push("resolveVerifiedOwnerRecipient");
      return "+6281100000001";
    });
    enqueueAndClaimMorningBriefDelivery.mockImplementation(async () => {
      callOrder.push("enqueueAndClaimMorningBriefDelivery");
      return { row: { id: "evt-mb-1" }, claimedByThisCall: true };
    });
    const { composeAndEnqueueMorningBrief } = await import("./service");

    await composeAndEnqueueMorningBrief({ workerId: "worker-a", now: FIXED_NOW });

    expect(callOrder).toEqual(["resolveVerifiedOwnerRecipient", "enqueueAndClaimMorningBriefDelivery"]);
  });

  it("returns the claimed event, including the resolved recipient, when this call wins the claim", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("Ringkasan ADOP pagi ini.");
    resolveVerifiedOwnerRecipient.mockResolvedValue("+6281100000001");
    enqueueAndClaimMorningBriefDelivery.mockResolvedValue({
      row: { id: "evt-mb-1" },
      claimedByThisCall: true,
    });
    const { composeAndEnqueueMorningBrief } = await import("./service");

    const result = await composeAndEnqueueMorningBrief({ workerId: "worker-a", now: FIXED_NOW });

    expect(result).toEqual({
      status: "claimed",
      businessDate: "2026-07-31",
      event: { id: "evt-mb-1", message: "Ringkasan ADOP pagi ini.", recipient: "+6281100000001" },
    });
    expect(enqueueAndClaimMorningBriefDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", businessDate: "2026-07-31", workerId: "worker-a" }),
    );
  });

  it("returns duplicate when another call already holds or completed today's claim", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("Ringkasan ADOP pagi ini.");
    resolveVerifiedOwnerRecipient.mockResolvedValue("+6281100000001");
    enqueueAndClaimMorningBriefDelivery.mockResolvedValue({
      row: { id: "evt-mb-1" },
      claimedByThisCall: false,
    });
    const { composeAndEnqueueMorningBrief } = await import("./service");

    await expect(composeAndEnqueueMorningBrief({ workerId: "worker-b", now: FIXED_NOW })).resolves.toEqual({
      status: "duplicate",
      businessDate: "2026-07-31",
    });
  });

  it("passes leaseSeconds through unchanged when provided", async () => {
    resolvePilotTenant.mockResolvedValue({ tenantId: "tenant-1" });
    getExecutiveReportSummaryForTenant.mockResolvedValue({});
    composeMorningBrief.mockReturnValue("x");
    resolveVerifiedOwnerRecipient.mockResolvedValue("+6281100000001");
    enqueueAndClaimMorningBriefDelivery.mockResolvedValue({ row: { id: "evt-mb-1" }, claimedByThisCall: true });
    const { composeAndEnqueueMorningBrief } = await import("./service");

    await composeAndEnqueueMorningBrief({ workerId: "worker-a", leaseSeconds: 600, now: FIXED_NOW });

    expect(enqueueAndClaimMorningBriefDelivery).toHaveBeenCalledWith(expect.objectContaining({ leaseSeconds: 600 }));
  });
});
