import { describe, expect, it } from "vitest";
import { reversePairedProjectRefundInputSchema } from "./validation";

const validCashId = "11111111-1111-4111-8111-111111111111";
const validCostId = "22222222-2222-4222-8222-222222222222";

describe("reversePairedProjectRefundInputSchema", () => {
  it("accepts a valid cash id, cost id, and reason", () => {
    const parsed = reversePairedProjectRefundInputSchema.parse({
      cashEntryId: validCashId,
      costEntryId: validCostId,
      reason: "koreksi refund salah alokasi project",
    });
    expect(parsed.cashEntryId).toBe(validCashId);
    expect(parsed.costEntryId).toBe(validCostId);
  });

  it("rejects a non-uuid cashEntryId", () => {
    const result = reversePairedProjectRefundInputSchema.safeParse({
      cashEntryId: "not-a-uuid",
      costEntryId: validCostId,
      reason: "alasan",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid costEntryId", () => {
    const result = reversePairedProjectRefundInputSchema.safeParse({
      cashEntryId: validCashId,
      costEntryId: "not-a-uuid",
      reason: "alasan",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reason", () => {
    const result = reversePairedProjectRefundInputSchema.safeParse({
      cashEntryId: validCashId,
      costEntryId: validCostId,
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    const result = reversePairedProjectRefundInputSchema.safeParse({
      cashEntryId: validCashId,
      costEntryId: validCostId,
      reason: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const result = reversePairedProjectRefundInputSchema.safeParse({
      cashEntryId: validCashId,
      costEntryId: validCostId,
    });
    expect(result.success).toBe(false);
  });

  it("trims the reason", () => {
    const parsed = reversePairedProjectRefundInputSchema.parse({
      cashEntryId: validCashId,
      costEntryId: validCostId,
      reason: "  alasan dengan spasi  ",
    });
    expect(parsed.reason).toBe("alasan dengan spasi");
  });
});
