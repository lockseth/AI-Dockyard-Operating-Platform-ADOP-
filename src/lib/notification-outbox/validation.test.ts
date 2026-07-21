import { describe, expect, it } from "vitest";
import {
  claimNotificationRequestSchema,
  completeNotificationRequestSchema,
  failNotificationRequestSchema,
} from "./validation";

describe("notification-outbox request schemas", () => {
  it("claim accepts a minimal valid body", () => {
    const result = claimNotificationRequestSchema.safeParse({ workerId: "n8n-123" });
    expect(result.success).toBe(true);
  });

  it("claim rejects an empty workerId", () => {
    expect(claimNotificationRequestSchema.safeParse({ workerId: "" }).success).toBe(false);
  });

  it("claim clamps leaseSeconds to a sane range", () => {
    expect(claimNotificationRequestSchema.safeParse({ workerId: "w", leaseSeconds: 10 }).success).toBe(false);
    expect(claimNotificationRequestSchema.safeParse({ workerId: "w", leaseSeconds: 9999 }).success).toBe(false);
    expect(claimNotificationRequestSchema.safeParse({ workerId: "w", leaseSeconds: 300 }).success).toBe(true);
  });

  it("no schema has a field that could carry a tenantId or actor — an attacker with the shared secret still cannot assert an identity", () => {
    for (const schema of [claimNotificationRequestSchema, completeNotificationRequestSchema, failNotificationRequestSchema]) {
      const shape = (schema as unknown as { shape: Record<string, unknown> }).shape;
      const keys = Object.keys(shape);
      expect(keys).not.toContain("tenantId");
      expect(keys).not.toContain("actorId");
      expect(keys).not.toContain("userId");
    }
  });

  it("complete requires a uuid id and a non-empty workerId", () => {
    expect(completeNotificationRequestSchema.safeParse({ id: "not-a-uuid", workerId: "w" }).success).toBe(false);
    expect(
      completeNotificationRequestSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", workerId: "w" })
        .success,
    ).toBe(true);
  });

  it("fail requires a non-empty error message", () => {
    expect(
      failNotificationRequestSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        workerId: "w",
        error: "",
      }).success,
    ).toBe(false);
    expect(
      failNotificationRequestSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        workerId: "w",
        error: "timeout",
      }).success,
    ).toBe(true);
  });
});
