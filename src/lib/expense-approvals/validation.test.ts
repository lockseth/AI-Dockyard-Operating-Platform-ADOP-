import { describe, expect, it } from "vitest";
import {
  approveExpenseSubmissionInputSchema,
  createExpenseDraftInputSchema,
  rejectExpenseSubmissionInputSchema,
  requestExpenseCorrectionInputSchema,
  reviseExpenseDraftInputSchema,
  submitExpenseInputSchema,
} from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ID_2 = "22222222-2222-4222-8222-222222222222";

describe("createExpenseDraftInputSchema", () => {
  it("requires tenantId, poolId, projectId, categoryId, amount, and description", () => {
    expect(createExpenseDraftInputSchema.safeParse({}).success).toBe(false);
    expect(
      createExpenseDraftInputSchema.safeParse({
        tenantId: VALID_ID,
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: 100,
      }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid input without vendorId/referenceNumber", () => {
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
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
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      vendorId: VALID_ID_2,
      amount: 1_500_000.5,
      description: "sewa alat las",
      referenceNumber: "REF-001",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty vendorId as undefined, not a validation error", () => {
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
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

  it("rejects a zero or negative amount", () => {
    expect(
      createExpenseDraftInputSchema.safeParse({
        tenantId: VALID_ID,
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: 0,
        description: "biaya",
      }).success,
    ).toBe(false);
    expect(
      createExpenseDraftInputSchema.safeParse({
        tenantId: VALID_ID,
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: -10,
        description: "biaya",
      }).success,
    ).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 100.555,
      description: "biaya",
    });
    expect(result.success).toBe(false);
  });

  it("coerces a numeric string amount (FormData input)", () => {
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
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
    const result = createExpenseDraftInputSchema.safeParse({
      tenantId: VALID_ID,
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 100,
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("reviseExpenseDraftInputSchema", () => {
  it("requires submissionId instead of tenantId", () => {
    const result = reviseExpenseDraftInputSchema.safeParse({
      submissionId: VALID_ID,
      poolId: VALID_ID,
      projectId: VALID_ID,
      categoryId: VALID_ID,
      amount: 100,
      description: "revisi biaya",
    });
    expect(result.success).toBe(true);
    expect(result.success && "tenantId" in result.data).toBe(false);
  });

  it("rejects a missing submissionId", () => {
    expect(
      reviseExpenseDraftInputSchema.safeParse({
        poolId: VALID_ID,
        projectId: VALID_ID,
        categoryId: VALID_ID,
        amount: 100,
        description: "revisi biaya",
      }).success,
    ).toBe(false);
  });
});

describe("submitExpenseInputSchema / approveExpenseSubmissionInputSchema", () => {
  it("requires a valid submissionId", () => {
    expect(submitExpenseInputSchema.safeParse({}).success).toBe(false);
    expect(submitExpenseInputSchema.safeParse({ submissionId: "not-a-uuid" }).success).toBe(false);
    expect(submitExpenseInputSchema.safeParse({ submissionId: VALID_ID }).success).toBe(true);

    expect(approveExpenseSubmissionInputSchema.safeParse({}).success).toBe(false);
    expect(approveExpenseSubmissionInputSchema.safeParse({ submissionId: VALID_ID }).success).toBe(true);
  });
});

describe("rejectExpenseSubmissionInputSchema / requestExpenseCorrectionInputSchema", () => {
  it("requires submissionId and a non-empty reason", () => {
    expect(rejectExpenseSubmissionInputSchema.safeParse({ submissionId: VALID_ID }).success).toBe(false);
    expect(
      rejectExpenseSubmissionInputSchema.safeParse({ submissionId: VALID_ID, reason: "" }).success,
    ).toBe(false);
    expect(
      rejectExpenseSubmissionInputSchema.safeParse({ submissionId: VALID_ID, reason: "nominal tidak sesuai" })
        .success,
    ).toBe(true);

    expect(requestExpenseCorrectionInputSchema.safeParse({ submissionId: VALID_ID }).success).toBe(false);
    expect(
      requestExpenseCorrectionInputSchema.safeParse({ submissionId: VALID_ID, reason: "" }).success,
    ).toBe(false);
    expect(
      requestExpenseCorrectionInputSchema.safeParse({ submissionId: VALID_ID, reason: "kategori salah" }).success,
    ).toBe(true);
  });
});
