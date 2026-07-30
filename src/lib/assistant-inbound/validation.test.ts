import { describe, expect, it } from "vitest";
import { assistantInboundEnvelopeSchema, MAX_INBOUND_BODY_BYTES, normalizeE164Address } from "./validation";

describe("normalizeE164Address", () => {
  it("passes through an already-valid E.164 number unchanged", () => {
    expect(normalizeE164Address("+6281234567890")).toBe("+6281234567890");
  });

  it("converts a local 0-prefixed number to +62", () => {
    expect(normalizeE164Address("081234567890")).toBe("+6281234567890");
  });

  it("prepends + to a bare 62-prefixed number", () => {
    expect(normalizeE164Address("6281234567890")).toBe("+6281234567890");
  });

  it("strips spaces/dashes/parentheses before normalizing", () => {
    expect(normalizeE164Address("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizeE164Address("+62 812 3456 7890")).toBe("+6281234567890");
    expect(normalizeE164Address("(0812) 3456 7890")).toBe("+6281234567890");
  });

  it("rejects a number in a format it cannot unambiguously resolve, rather than guessing a country code", () => {
    expect(normalizeE164Address("8123456789")).toBeNull();
    expect(normalizeE164Address("1-800-555-0100")).toBeNull();
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(normalizeE164Address("")).toBeNull();
    expect(normalizeE164Address("   ")).toBeNull();
  });

  it("rejects a value that resolves to an invalid E.164 shape (too short/long, leading zero after country code)", () => {
    expect(normalizeE164Address("0")).toBeNull();
    expect(normalizeE164Address("+62")).toBeNull();
  });
});

describe("assistantInboundEnvelopeSchema", () => {
  // Gate 6J-C1 verified capture: providerTimestamp is Unix seconds, not
  // ISO-8601 — see the "providerTimestamp" describe block below.
  const validBase = {
    provider: "fonnte",
    providerMessageId: "fonnte:inbox:482913",
    channel: "whatsapp" as const,
    senderAddress: "081234567890",
    messageText: "PAIR ABCDEF",
    providerTimestamp: "1783148400",
  };

  it("accepts a valid envelope and normalizes senderAddress to E.164", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.senderAddress).toBe("+6281234567890");
    }
  });

  it("rejects a channel other than whatsapp", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({ ...validBase, channel: "telegram" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a sender address that cannot be normalized", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({ ...validBase, senderAddress: "not-a-number" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing providerMessageId when receiverAddress is also absent (cannot derive one)", () => {
    const rest = { ...validBase, providerMessageId: undefined };
    const parsed = assistantInboundEnvelopeSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing providerMessageId for a non-fonnte provider, even with receiverAddress present", () => {
    const rest = { ...validBase, provider: "other-provider", providerMessageId: undefined, receiverAddress: "081299999999" };
    const parsed = assistantInboundEnvelopeSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });

  it("accepts a fonnte envelope without providerMessageId when receiverAddress (device) is present — Gate 6J-C1 derived-id path", () => {
    const rest = { ...validBase, providerMessageId: undefined, receiverAddress: "081299999999" };
    const parsed = assistantInboundEnvelopeSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.providerMessageId).toBeUndefined();
      expect(parsed.data.receiverAddress).toBe("+6281299999999");
    }
  });

  it("rejects messageText beyond the 4096-character cap", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({ ...validBase, messageText: "a".repeat(4097) });
    expect(parsed.success).toBe(false);
  });

  it("silently drops any unrecognized field (e.g. a forged tenantId) rather than honoring it", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({ ...validBase, tenantId: "forged-tenant" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("tenantId");
    }
  });
});

describe("assistantInboundEnvelopeSchema — providerTimestamp (Gate 6J-C1 verified: Unix seconds)", () => {
  const validBase = {
    provider: "fonnte",
    providerMessageId: "fonnte:inbox:482913",
    channel: "whatsapp" as const,
    senderAddress: "081234567890",
    messageText: "PAIR ABCDEF",
    providerTimestamp: "1783148400",
  };

  it("accepts a plain Unix-seconds digit string", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.providerTimestamp).toBe("1783148400");
  });

  it("normalizes away leading zeros deterministically", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({ ...validBase, providerTimestamp: "0178314840" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.providerTimestamp).toBe("178314840");
  });

  it("rejects an ISO-8601 timestamp (the previous, unverified assumption)", () => {
    const parsed = assistantInboundEnvelopeSchema.safeParse({
      ...validBase,
      providerTimestamp: "2026-07-30T07:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-numeric or empty providerTimestamp", () => {
    expect(assistantInboundEnvelopeSchema.safeParse({ ...validBase, providerTimestamp: "" }).success).toBe(false);
    expect(assistantInboundEnvelopeSchema.safeParse({ ...validBase, providerTimestamp: "not-a-number" }).success).toBe(
      false,
    );
  });
});

describe("MAX_INBOUND_BODY_BYTES", () => {
  it("is a small, sane bound (kilobytes, not megabytes)", () => {
    expect(MAX_INBOUND_BODY_BYTES).toBeGreaterThan(0);
    expect(MAX_INBOUND_BODY_BYTES).toBeLessThanOrEqual(64 * 1024);
  });
});
