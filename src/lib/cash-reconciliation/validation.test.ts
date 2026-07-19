import { describe, expect, it } from "vitest";
import {
  approveCashReconciliationInputSchema,
  createCashReconciliationDraftInputSchema,
  rejectCashReconciliationInputSchema,
  reopenCashPoolInputSchema,
  requestCashReconciliationCorrectionInputSchema,
  reviseCashReconciliationDraftInputSchema,
  submitCashReconciliationInputSchema,
} from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("createCashReconciliationDraftInputSchema", () => {
  it("requires poolId and actualCountedCash", () => {
    expect(createCashReconciliationDraftInputSchema.safeParse({}).success).toBe(false);
    expect(createCashReconciliationDraftInputSchema.safeParse({ poolId: VALID_ID }).success).toBe(false);
  });

  it("accepts a minimal valid input without explanation", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: 1_000_000,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.explanation).toBeUndefined();
  });

  it("accepts zero as a valid actual counted cash", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative actual counted cash", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an amount with more than 2 decimal places", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: 100.555,
    });
    expect(result.success).toBe(false);
  });

  it("coerces a numeric string amount (FormData input)", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: "250000.50",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.actualCountedCash).toBe(250_000.5);
  });

  it("accepts an explanation for a non-zero variance case", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: 900_000,
      explanation: "selisih karena uang kembalian belum disetor",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty explanation as undefined, not a validation error", () => {
    const result = createCashReconciliationDraftInputSchema.safeParse({
      poolId: VALID_ID,
      actualCountedCash: 900_000,
      explanation: "",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.explanation).toBeUndefined();
  });
});

describe("reviseCashReconciliationDraftInputSchema", () => {
  it("requires reconciliationId instead of poolId", () => {
    const result = reviseCashReconciliationDraftInputSchema.safeParse({
      reconciliationId: VALID_ID,
      actualCountedCash: 100,
    });
    expect(result.success).toBe(true);
    expect(result.success && "poolId" in result.data).toBe(false);
  });

  it("rejects a missing reconciliationId", () => {
    expect(
      reviseCashReconciliationDraftInputSchema.safeParse({
        actualCountedCash: 100,
      }).success,
    ).toBe(false);
  });
});

describe("submitCashReconciliationInputSchema / approveCashReconciliationInputSchema", () => {
  it("requires a valid reconciliationId", () => {
    expect(submitCashReconciliationInputSchema.safeParse({}).success).toBe(false);
    expect(submitCashReconciliationInputSchema.safeParse({ reconciliationId: "not-a-uuid" }).success).toBe(false);
    expect(submitCashReconciliationInputSchema.safeParse({ reconciliationId: VALID_ID }).success).toBe(true);

    expect(approveCashReconciliationInputSchema.safeParse({}).success).toBe(false);
    expect(approveCashReconciliationInputSchema.safeParse({ reconciliationId: VALID_ID }).success).toBe(true);
  });
});

describe("rejectCashReconciliationInputSchema / requestCashReconciliationCorrectionInputSchema", () => {
  it("requires reconciliationId and a non-empty reason", () => {
    expect(rejectCashReconciliationInputSchema.safeParse({ reconciliationId: VALID_ID }).success).toBe(false);
    expect(
      rejectCashReconciliationInputSchema.safeParse({ reconciliationId: VALID_ID, reason: "" }).success,
    ).toBe(false);
    expect(
      rejectCashReconciliationInputSchema.safeParse({ reconciliationId: VALID_ID, reason: "selisih tidak wajar" })
        .success,
    ).toBe(true);

    expect(requestCashReconciliationCorrectionInputSchema.safeParse({ reconciliationId: VALID_ID }).success).toBe(
      false,
    );
    expect(
      requestCashReconciliationCorrectionInputSchema.safeParse({ reconciliationId: VALID_ID, reason: "" }).success,
    ).toBe(false);
    expect(
      requestCashReconciliationCorrectionInputSchema.safeParse({
        reconciliationId: VALID_ID,
        reason: "nominal counting salah input",
      }).success,
    ).toBe(true);
  });
});

describe("reopenCashPoolInputSchema", () => {
  it("requires poolId and a non-empty reason", () => {
    expect(reopenCashPoolInputSchema.safeParse({ poolId: VALID_ID }).success).toBe(false);
    expect(reopenCashPoolInputSchema.safeParse({ poolId: VALID_ID, reason: "" }).success).toBe(false);
    expect(
      reopenCashPoolInputSchema.safeParse({ poolId: VALID_ID, reason: "owner minta koreksi ulang" }).success,
    ).toBe(true);
  });
});
