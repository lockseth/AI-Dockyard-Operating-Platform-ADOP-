import { describe, expect, it } from "vitest";
import { recordProjectExpenseInputSchema, reverseProjectExpenseInputSchema } from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ID_2 = "22222222-2222-4222-8222-222222222222";

describe("recordProjectExpenseInputSchema", () => {
  it("requires poolId, projectId, categoryId, amount, and description", () => {
    expect(recordProjectExpenseInputSchema.safeParse({}).success).toBe(false);
    expect(
      recordProjectExpenseInputSchema.safeParse({
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: 100,
      }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid input without vendorId/referenceNumber", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 250_000,
      description: "beli spare part",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.vendorId).toBeUndefined();
    expect(result.success && result.data.referenceNumber).toBeUndefined();
  });

  it("accepts a full input with vendorId and referenceNumber", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      vendorId: VALID_ID_2,
      amount: 1_500_000.5,
      description: "sewa alat las",
      referenceNumber: "INV-001",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty vendorId as undefined, not a validation error", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      vendorId: "",
      amount: 100,
      description: "biaya lain",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.vendorId).toBeUndefined();
  });

  it("rejects a malformed vendorId", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      vendorId: "not-a-uuid",
      amount: 100,
      description: "biaya lain",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(
      recordProjectExpenseInputSchema.safeParse({
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: 0,
        description: "biaya",
      }).success,
    ).toBe(false);
    expect(
      recordProjectExpenseInputSchema.safeParse({
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: -10,
        description: "biaya",
      }).success,
    ).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 100.555,
      description: "biaya",
    });
    expect(result.success).toBe(false);
  });

  it("coerces a numeric string amount (FormData input)", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: "250000.50",
      description: "biaya",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.amount).toBe(250_000.5);
  });

  it("rejects an empty description", () => {
    const result = recordProjectExpenseInputSchema.safeParse({
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 100,
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("reverseProjectExpenseInputSchema", () => {
  it("requires entryId and a non-empty reason", () => {
    expect(reverseProjectExpenseInputSchema.safeParse({ entryId: VALID_ID }).success).toBe(false);
    expect(reverseProjectExpenseInputSchema.safeParse({ entryId: VALID_ID, reason: "" }).success).toBe(false);
  });

  it("accepts a valid reversal input", () => {
    const result = reverseProjectExpenseInputSchema.safeParse({ entryId: VALID_ID, reason: "salah kategori" });
    expect(result.success).toBe(true);
  });
});
