import { describe, expect, it } from "vitest";
import {
  getTrustedTransactionDetailInputSchema,
  listTrustedTransactionsInputSchema,
  summarizeTrustedTransactionsInputSchema,
} from "./validation";

describe("listTrustedTransactionsInputSchema", () => {
  it("defaults limit and accepts an empty filter set", () => {
    const parsed = listTrustedTransactionsInputSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.dateFrom).toBeUndefined();
  });

  it("accepts a fully-specified filter set", () => {
    const parsed = listTrustedTransactionsInputSchema.parse({
      dateFrom: "2036-01-01",
      dateTo: "2036-01-31",
      projectId: "11111111-1111-4111-8111-111111111111",
      transactionType: "project_refund",
      transactionDirection: "cost_reduction",
      source: "import",
      status: "reversed",
      importBatchId: "22222222-2222-4222-8222-222222222222",
      search: "spare part",
      cursor: "abc123",
      limit: "25",
    });
    expect(parsed.limit).toBe(25);
    expect(parsed.transactionType).toBe("project_refund");
  });

  it("rejects dateFrom after dateTo", () => {
    const result = listTrustedTransactionsInputSchema.safeParse({ dateFrom: "2036-02-01", dateTo: "2036-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown transaction type", () => {
    const result = listTrustedTransactionsInputSchema.safeParse({ transactionType: "not_a_real_type" });
    expect(result.success).toBe(false);
  });

  it("rejects a limit above the server-side cap", () => {
    const result = listTrustedTransactionsInputSchema.safeParse({ limit: 500 });
    expect(result.success).toBe(false);
  });

  it("accepts the Gate 1K.1 'partially_reversed' status value", () => {
    const parsed = listTrustedTransactionsInputSchema.parse({ status: "partially_reversed" });
    expect(parsed.status).toBe("partially_reversed");
  });

  it("treats empty-string optional fields as absent", () => {
    const parsed = listTrustedTransactionsInputSchema.parse({ projectId: "", search: "", transactionType: "" });
    expect(parsed.projectId).toBeUndefined();
    expect(parsed.search).toBeUndefined();
    expect(parsed.transactionType).toBeUndefined();
  });
});

describe("summarizeTrustedTransactionsInputSchema", () => {
  it("shares the same date-range validation as the list schema", () => {
    const result = summarizeTrustedTransactionsInputSchema.safeParse({ dateFrom: "2036-02-01", dateTo: "2036-01-01" });
    expect(result.success).toBe(false);
  });

  it("does not accept cursor/limit fields", () => {
    const parsed = summarizeTrustedTransactionsInputSchema.parse({ dateFrom: "2036-01-01" });
    expect("cursor" in parsed).toBe(false);
    expect("limit" in parsed).toBe(false);
  });
});

describe("getTrustedTransactionDetailInputSchema", () => {
  it("accepts a synthetic logical transaction id", () => {
    const parsed = getTrustedTransactionDetailInputSchema.parse({
      logicalTransactionId: "refund:00000000-0000-0000-0000-000000000001:original",
    });
    expect(parsed.logicalTransactionId).toContain("refund:");
  });

  it("rejects an empty id", () => {
    const result = getTrustedTransactionDetailInputSchema.safeParse({ logicalTransactionId: "" });
    expect(result.success).toBe(false);
  });
});
