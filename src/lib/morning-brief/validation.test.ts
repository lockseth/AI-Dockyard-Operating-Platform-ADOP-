import { describe, expect, it } from "vitest";
import { morningBriefRequestSchema } from "./validation";

describe("morningBriefRequestSchema", () => {
  it("accepts a minimal valid body", () => {
    expect(morningBriefRequestSchema.safeParse({ workerId: "n8n-123" }).success).toBe(true);
  });

  it("rejects an empty workerId", () => {
    expect(morningBriefRequestSchema.safeParse({ workerId: "" }).success).toBe(false);
  });

  it("accepts an explicit dryRun boolean", () => {
    expect(morningBriefRequestSchema.safeParse({ workerId: "n8n-123", dryRun: true }).success).toBe(true);
    expect(morningBriefRequestSchema.safeParse({ workerId: "n8n-123", dryRun: false }).success).toBe(true);
  });

  it("clamps leaseSeconds to the same [30, 3600] range as the generic outbox schemas", () => {
    expect(morningBriefRequestSchema.safeParse({ workerId: "w", leaseSeconds: 10 }).success).toBe(false);
    expect(morningBriefRequestSchema.safeParse({ workerId: "w", leaseSeconds: 9999 }).success).toBe(false);
    expect(morningBriefRequestSchema.safeParse({ workerId: "w", leaseSeconds: 300 }).success).toBe(true);
  });

  it("has no field that could carry a tenantId or actor — the pilot tenant is server-resolved only", () => {
    const shape = (morningBriefRequestSchema as unknown as { shape: Record<string, unknown> }).shape;
    const keys = Object.keys(shape);
    expect(keys).not.toContain("tenantId");
    expect(keys).not.toContain("actorId");
    expect(keys).not.toContain("userId");
  });
});
