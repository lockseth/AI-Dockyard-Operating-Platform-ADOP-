import { describe, expect, it } from "vitest";
import { getExpenseDuplicateReasonLabel } from "./labels";
import { EXPENSE_DUPLICATE_REASON_CODES } from "@/lib/expense-duplicate-detection/types";

describe("getExpenseDuplicateReasonLabel", () => {
  it("translates reference_match", () => {
    expect(getExpenseDuplicateReasonLabel("reference_match")).toBe("Nomor referensi sama");
  });

  it("translates exact_financial_match", () => {
    expect(getExpenseDuplicateReasonLabel("exact_financial_match")).toBe("Data biaya sama");
  });

  it("translates cross_project_reference_match", () => {
    expect(getExpenseDuplicateReasonLabel("cross_project_reference_match")).toBe(
      "Referensi sama pada kapal berbeda",
    );
  });

  it("translates same_day_amount_vendor_match", () => {
    expect(getExpenseDuplicateReasonLabel("same_day_amount_vendor_match")).toBe(
      "Tanggal, nominal, dan vendor sama",
    );
  });

  it("has a label for every known reason code", () => {
    for (const code of EXPENSE_DUPLICATE_REASON_CODES) {
      expect(getExpenseDuplicateReasonLabel(code)).toBeTruthy();
    }
  });
});
