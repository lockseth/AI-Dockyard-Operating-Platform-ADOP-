import { describe, expect, it } from "vitest";
import {
  listExpenseDuplicateCandidatesForSubmissionInputSchema,
  resolveExpenseDuplicateCandidateInputSchema,
} from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("listExpenseDuplicateCandidatesForSubmissionInputSchema", () => {
  it("requires a valid submissionId", () => {
    expect(listExpenseDuplicateCandidatesForSubmissionInputSchema.safeParse({}).success).toBe(false);
    expect(
      listExpenseDuplicateCandidatesForSubmissionInputSchema.safeParse({ submissionId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      listExpenseDuplicateCandidatesForSubmissionInputSchema.safeParse({ submissionId: VALID_ID }).success,
    ).toBe(true);
  });
});

describe("resolveExpenseDuplicateCandidateInputSchema", () => {
  it("requires candidateId, a valid resolution, and a non-empty reason", () => {
    expect(resolveExpenseDuplicateCandidateInputSchema.safeParse({}).success).toBe(false);
    expect(
      resolveExpenseDuplicateCandidateInputSchema.safeParse({
        candidateId: VALID_ID,
        resolution: "not_duplicate",
      }).success,
    ).toBe(false);
    expect(
      resolveExpenseDuplicateCandidateInputSchema.safeParse({
        candidateId: VALID_ID,
        resolution: "not_duplicate",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid not_duplicate resolution", () => {
    const result = resolveExpenseDuplicateCandidateInputSchema.safeParse({
      candidateId: VALID_ID,
      resolution: "not_duplicate",
      reason: "sudah ditinjau, bukan duplikat",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid confirmed_duplicate resolution", () => {
    const result = resolveExpenseDuplicateCandidateInputSchema.safeParse({
      candidateId: VALID_ID,
      resolution: "confirmed_duplicate",
      reason: "terindikasi duplikasi nyata",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized resolution value", () => {
    const result = resolveExpenseDuplicateCandidateInputSchema.safeParse({
      candidateId: VALID_ID,
      resolution: "pending",
      reason: "coba paksa jadi pending",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid candidateId", () => {
    const result = resolveExpenseDuplicateCandidateInputSchema.safeParse({
      candidateId: "not-a-uuid",
      resolution: "not_duplicate",
      reason: "alasan",
    });
    expect(result.success).toBe(false);
  });
});
