import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const listInvoiceDeliveryEvents = vi.fn();
const recordInvoiceDeliveryEvent = vi.fn();
vi.mock("./repository", () => ({
  listInvoiceDeliveryEvents,
  recordInvoiceDeliveryEvent,
}));

const OWNER_CONTEXT = {
  userId: "owner-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  tenantDisplayName: "Tenant One",
  membershipId: "membership-owner",
  roles: ["owner"] as const,
  legalEntities: [],
};
const REVIEWER_CONTEXT = { ...OWNER_CONTEXT, roles: ["reviewer"] as const };

const VALID_INVOICE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listInvoiceDeliveryEventsForActiveTenant", () => {
  it("rejects reviewer before ever calling the repository", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { listInvoiceDeliveryEventsForActiveTenant } = await import("./service");

    await expect(listInvoiceDeliveryEventsForActiveTenant({ invoiceId: VALID_INVOICE_ID })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
    expect(listInvoiceDeliveryEvents).not.toHaveBeenCalled();
  });

  it("passes the active tenant id to the repository for owner", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    listInvoiceDeliveryEvents.mockResolvedValue([{ id: "event-1" }]);
    const { listInvoiceDeliveryEventsForActiveTenant } = await import("./service");

    const result = await listInvoiceDeliveryEventsForActiveTenant({ invoiceId: VALID_INVOICE_ID });

    expect(listInvoiceDeliveryEvents).toHaveBeenCalledWith("tenant-1", VALID_INVOICE_ID);
    expect(result).toEqual([{ id: "event-1" }]);
  });

  it("returns an empty array (never throws) for an invalid invoiceId, before any auth/repository call", async () => {
    const { listInvoiceDeliveryEventsForActiveTenant } = await import("./service");

    const result = await listInvoiceDeliveryEventsForActiveTenant({ invoiceId: "not-a-uuid" });

    expect(result).toEqual([]);
    expect(requireTenantContext).not.toHaveBeenCalled();
    expect(listInvoiceDeliveryEvents).not.toHaveBeenCalled();
  });
});

describe("recordInvoiceDeliveryForActiveTenant", () => {
  it("rejects reviewer before ever calling the repository", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { recordInvoiceDeliveryForActiveTenant } = await import("./service");

    await expect(
      recordInvoiceDeliveryForActiveTenant({
        invoiceId: VALID_INVOICE_ID,
        channel: "email",
        eventType: "sent",
        recipientSnapshot: "pic@client.co",
      }),
    ).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(recordInvoiceDeliveryEvent).not.toHaveBeenCalled();
  });

  it("returns fieldErrors for invalid input without calling the repository", async () => {
    const { recordInvoiceDeliveryForActiveTenant } = await import("./service");

    const result = await recordInvoiceDeliveryForActiveTenant({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "failed",
      recipientSnapshot: "pic@client.co",
      // failureReason missing — invalid per the failed-shape refinement
    });

    expect(result.fieldErrors).toBeDefined();
    expect(recordInvoiceDeliveryEvent).not.toHaveBeenCalled();
  });

  it("forwards a valid sent event to the repository and maps a returned error", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    recordInvoiceDeliveryEvent.mockResolvedValue({ error: { code: "P0001", message: "invoice must be issued before recording a delivery event" } });
    const { recordInvoiceDeliveryForActiveTenant } = await import("./service");

    const result = await recordInvoiceDeliveryForActiveTenant({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "sent",
      recipientSnapshot: "pic@client.co",
    });

    expect(recordInvoiceDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: VALID_INVOICE_ID, channel: "email", eventType: "sent" }),
    );
    expect(result.error).toMatch(/sudah diterbitkan/);
  });

  it("succeeds with no error when the repository call succeeds", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    recordInvoiceDeliveryEvent.mockResolvedValue({ error: null, data: { id: "event-1" } });
    const { recordInvoiceDeliveryForActiveTenant } = await import("./service");

    const result = await recordInvoiceDeliveryForActiveTenant({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "sent",
      recipientSnapshot: "pic@client.co",
    });

    expect(result).toEqual({});
  });
});

describe("recordInvoiceAcknowledgmentForActiveTenant", () => {
  it("rejects reviewer before ever calling the repository", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { recordInvoiceAcknowledgmentForActiveTenant } = await import("./service");

    await expect(
      recordInvoiceAcknowledgmentForActiveTenant({
        invoiceId: VALID_INVOICE_ID,
        channel: "manual",
        recipientSnapshot: "Pak Budi",
      }),
    ).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(recordInvoiceDeliveryEvent).not.toHaveBeenCalled();
  });

  it("always forwards eventType 'acknowledged' to the repository, never accepting it from the caller", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    recordInvoiceDeliveryEvent.mockResolvedValue({ error: null, data: { id: "event-2" } });
    const { recordInvoiceAcknowledgmentForActiveTenant } = await import("./service");

    await recordInvoiceAcknowledgmentForActiveTenant({
      invoiceId: VALID_INVOICE_ID,
      channel: "manual",
      recipientSnapshot: "Pak Budi",
      acknowledgmentNote: "Konfirmasi telepon",
    });

    expect(recordInvoiceDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: VALID_INVOICE_ID,
        channel: "manual",
        eventType: "acknowledged",
        recipientSnapshot: "Pak Budi",
        acknowledgmentNote: "Konfirmasi telepon",
      }),
    );
  });

  it("maps a returned already-acknowledged error to the friendly terminal-state message", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    recordInvoiceDeliveryEvent.mockResolvedValue({
      error: { code: "P0001", message: "invoice delivery is already acknowledged; no further events allowed" },
    });
    const { recordInvoiceAcknowledgmentForActiveTenant } = await import("./service");

    const result = await recordInvoiceAcknowledgmentForActiveTenant({
      invoiceId: VALID_INVOICE_ID,
      channel: "manual",
      recipientSnapshot: "Pak Budi",
    });

    expect(result.error).toMatch(/sudah tercatat diterima/);
  });
});
