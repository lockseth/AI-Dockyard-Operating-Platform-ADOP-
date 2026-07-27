import { describe, expect, it } from "vitest";
import {
  recordInvoiceAcknowledgmentInputSchema,
  recordInvoiceDeliveryInputSchema,
} from "./validation";

const VALID_INVOICE_ID = "11111111-1111-4111-8111-111111111111";

describe("recordInvoiceDeliveryInputSchema", () => {
  it("accepts a valid sent event with no failure reason", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "sent",
      recipientSnapshot: "pic@client.co",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a failed event without a failure reason", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "whatsapp",
      eventType: "failed",
      recipientSnapshot: "0812xxxx",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a failed event with a failure reason", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "whatsapp",
      eventType: "failed",
      recipientSnapshot: "0812xxxx",
      failureReason: "Nomor tidak aktif",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a failure reason attached to a non-failed event", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "sent",
      recipientSnapshot: "pic@client.co",
      failureReason: "should not be here",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty recipient snapshot", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "sent",
      recipientSnapshot: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid channel", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "sms",
      eventType: "sent",
      recipientSnapshot: "pic@client.co",
    });
    expect(result.success).toBe(false);
  });

  it("rejects `acknowledged` as an event type for the delivery form", () => {
    const result = recordInvoiceDeliveryInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "email",
      eventType: "acknowledged",
      recipientSnapshot: "pic@client.co",
    });
    expect(result.success).toBe(false);
  });
});

describe("recordInvoiceAcknowledgmentInputSchema", () => {
  it("accepts a valid acknowledgment with no note", () => {
    const result = recordInvoiceAcknowledgmentInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "manual",
      recipientSnapshot: "Pak Budi (PIC Finance)",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid acknowledgment with a note", () => {
    const result = recordInvoiceAcknowledgmentInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "manual",
      recipientSnapshot: "Pak Budi (PIC Finance)",
      acknowledgmentNote: "Dikonfirmasi lewat telepon",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing recipient", () => {
    const result = recordInvoiceAcknowledgmentInputSchema.safeParse({
      invoiceId: VALID_INVOICE_ID,
      channel: "manual",
      recipientSnapshot: "",
    });
    expect(result.success).toBe(false);
  });
});
