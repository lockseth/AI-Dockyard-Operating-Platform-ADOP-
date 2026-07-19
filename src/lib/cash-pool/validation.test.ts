import { describe, expect, it } from "vitest";
import {
  getOrCreateDailyCashPoolInputSchema,
  recordCashPoolEntryInputSchema,
  reverseCashPoolEntryInputSchema,
} from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("getOrCreateDailyCashPoolInputSchema", () => {
  it("requires a well-formed businessDate", () => {
    expect(getOrCreateDailyCashPoolInputSchema.safeParse({}).success).toBe(false);
    expect(getOrCreateDailyCashPoolInputSchema.safeParse({ businessDate: "19/07/2026" }).success).toBe(false);
  });

  it("accepts a valid ISO businessDate", () => {
    const result = getOrCreateDailyCashPoolInputSchema.safeParse({ businessDate: "2026-07-19" });
    expect(result.success).toBe(true);
  });
});

describe("recordCashPoolEntryInputSchema", () => {
  it("requires poolId, entryType, and amount", () => {
    expect(recordCashPoolEntryInputSchema.safeParse({}).success).toBe(false);
    expect(
      recordCashPoolEntryInputSchema.safeParse({ poolId: VALID_ID, entryType: "opening_cash" }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid input without description", () => {
    const result = recordCashPoolEntryInputSchema.safeParse({
      poolId: VALID_ID,
      entryType: "cash_top_up",
      amount: 50_000_000,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.description).toBeUndefined();
  });

  it("rejects an unknown entryType", () => {
    const result = recordCashPoolEntryInputSchema.safeParse({
      poolId: VALID_ID,
      entryType: "vessel_wallet",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      recordCashPoolEntryInputSchema.safeParse({ poolId: VALID_ID, entryType: "other_cash_in", amount: 0 }).success,
    ).toBe(false);
    expect(
      recordCashPoolEntryInputSchema.safeParse({ poolId: VALID_ID, entryType: "other_cash_in", amount: -10 }).success,
    ).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    const result = recordCashPoolEntryInputSchema.safeParse({
      poolId: VALID_ID,
      entryType: "other_cash_in",
      amount: 100.555,
    });
    expect(result.success).toBe(false);
  });

  it("coerces a numeric string amount (FormData input)", () => {
    const result = recordCashPoolEntryInputSchema.safeParse({
      poolId: VALID_ID,
      entryType: "opening_cash",
      amount: "50000000.50",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.amount).toBe(50_000_000.5);
  });

  it("treats an empty description as undefined, not a validation error", () => {
    const result = recordCashPoolEntryInputSchema.safeParse({
      poolId: VALID_ID,
      entryType: "opening_cash",
      amount: 1000,
      description: "",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.description).toBeUndefined();
  });
});

describe("reverseCashPoolEntryInputSchema", () => {
  it("requires entryId and a non-empty reason", () => {
    expect(reverseCashPoolEntryInputSchema.safeParse({ entryId: VALID_ID }).success).toBe(false);
    expect(reverseCashPoolEntryInputSchema.safeParse({ entryId: VALID_ID, reason: "" }).success).toBe(false);
  });

  it("accepts a valid reversal input", () => {
    const result = reverseCashPoolEntryInputSchema.safeParse({ entryId: VALID_ID, reason: "salah input nominal" });
    expect(result.success).toBe(true);
  });
});
