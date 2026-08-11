import { describe, expect, it } from "vitest";
import {
  completeClientVerificationInputSchema,
  completePairingInputSchema,
  issueClientVerificationChallengeInputSchema,
  issuePairingChallengeInputSchema,
  normalizeE164Address,
  normalizedAddressSchema,
  registerOwnerWhatsappNumberInputSchema,
  resetClientVerificationInputSchema,
  revokePairingInputSchema,
} from "./validation";

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ADDRESS = "+6281234567890";

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

  it("rejects a format it cannot unambiguously resolve, rather than guessing a country code", () => {
    expect(normalizeE164Address("8123456789")).toBeNull();
    expect(normalizeE164Address("1-800-555-0100")).toBeNull();
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(normalizeE164Address("")).toBeNull();
    expect(normalizeE164Address("   ")).toBeNull();
  });
});

describe("registerOwnerWhatsappNumberInputSchema", () => {
  it("accepts a raw number string", () => {
    expect(registerOwnerWhatsappNumberInputSchema.safeParse({ rawNumber: "081234567890" }).success).toBe(true);
  });

  it("rejects a blank rawNumber", () => {
    expect(registerOwnerWhatsappNumberInputSchema.safeParse({ rawNumber: "" }).success).toBe(false);
  });

  it("rejects a missing rawNumber", () => {
    expect(registerOwnerWhatsappNumberInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("normalizedAddressSchema (E.164)", () => {
  it("accepts a valid E.164 address", () => {
    expect(normalizedAddressSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });

  it("accepts the minimum length (7 digits after +)", () => {
    expect(normalizedAddressSchema.safeParse("+1234567").success).toBe(true);
  });

  it("rejects a missing leading +", () => {
    expect(normalizedAddressSchema.safeParse("6281234567890").success).toBe(false);
  });

  it("rejects a leading zero after +", () => {
    expect(normalizedAddressSchema.safeParse("+0812345678").success).toBe(false);
  });

  it("rejects non-digit characters", () => {
    expect(normalizedAddressSchema.safeParse("+6281-234-5678").success).toBe(false);
  });

  it("rejects more than 15 digits total", () => {
    expect(normalizedAddressSchema.safeParse("+1234567890123456").success).toBe(false);
  });

  it("trims surrounding whitespace before validating", () => {
    const parsed = normalizedAddressSchema.safeParse(`  ${VALID_ADDRESS}  `);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe(VALID_ADDRESS);
  });
});

describe("issuePairingChallengeInputSchema", () => {
  it("accepts a valid whatsapp pairing request", () => {
    expect(
      issuePairingChallengeInputSchema.safeParse({
        tenantId: VALID_TENANT_ID,
        channel: "whatsapp",
        normalizedAddress: VALID_ADDRESS,
      }).success,
    ).toBe(true);
  });

  it("rejects an unsupported channel", () => {
    expect(
      issuePairingChallengeInputSchema.safeParse({
        tenantId: VALID_TENANT_ID,
        channel: "telegram",
        normalizedAddress: VALID_ADDRESS,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid tenantId", () => {
    expect(
      issuePairingChallengeInputSchema.safeParse({
        tenantId: "not-a-uuid",
        channel: "whatsapp",
        normalizedAddress: VALID_ADDRESS,
      }).success,
    ).toBe(false);
  });
});

describe("revokePairingInputSchema", () => {
  it("accepts an identityId with no reason", () => {
    expect(revokePairingInputSchema.safeParse({ identityId: VALID_TENANT_ID }).success).toBe(true);
  });

  it("accepts an identityId with a reason", () => {
    expect(
      revokePairingInputSchema.safeParse({ identityId: VALID_TENANT_ID, reason: "no longer needed" }).success,
    ).toBe(true);
  });

  it("rejects a missing identityId", () => {
    expect(revokePairingInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("issueClientVerificationChallengeInputSchema", () => {
  it("accepts a valid contactId", () => {
    expect(issueClientVerificationChallengeInputSchema.safeParse({ contactId: VALID_TENANT_ID }).success).toBe(
      true,
    );
  });

  it("rejects a missing contactId", () => {
    expect(issueClientVerificationChallengeInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("resetClientVerificationInputSchema", () => {
  it("accepts a contactId with an optional reason", () => {
    expect(
      resetClientVerificationInputSchema.safeParse({ contactId: VALID_TENANT_ID, reason: "cancel" }).success,
    ).toBe(true);
  });
});

describe("completePairingInputSchema", () => {
  it("accepts a well-formed completion request", () => {
    expect(
      completePairingInputSchema.safeParse({
        channel: "whatsapp",
        normalizedAddress: VALID_ADDRESS,
        code: "ABC123",
      }).success,
    ).toBe(true);
  });

  it("rejects a blank code", () => {
    expect(
      completePairingInputSchema.safeParse({
        channel: "whatsapp",
        normalizedAddress: VALID_ADDRESS,
        code: "",
      }).success,
    ).toBe(false);
  });
});

describe("completeClientVerificationInputSchema", () => {
  it("accepts a well-formed completion request", () => {
    expect(
      completeClientVerificationInputSchema.safeParse({
        tenantId: VALID_TENANT_ID,
        whatsappNumber: VALID_ADDRESS,
        code: "ABC123",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid whatsapp number", () => {
    expect(
      completeClientVerificationInputSchema.safeParse({
        tenantId: VALID_TENANT_ID,
        whatsappNumber: "0812-not-e164",
        code: "ABC123",
      }).success,
    ).toBe(false);
  });
});
