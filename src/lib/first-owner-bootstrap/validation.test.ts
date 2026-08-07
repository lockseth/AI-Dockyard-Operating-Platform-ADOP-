import { describe, expect, it } from "vitest";
import { bootstrapEmailSchema, tenantDisplayNameSchema, tenantSlugSchema } from "./validation";

describe("tenantSlugSchema", () => {
  it("accepts lowercase/digits/single-hyphen slugs", () => {
    expect(tenantSlugSchema.safeParse("pt-pelayaran-example").success).toBe(true);
    expect(tenantSlugSchema.safeParse("tenant-01").success).toBe(true);
  });

  it("rejects uppercase, spaces, double hyphens, and leading/trailing hyphens", () => {
    expect(tenantSlugSchema.safeParse("PT-Example").success).toBe(false);
    expect(tenantSlugSchema.safeParse("has space").success).toBe(false);
    expect(tenantSlugSchema.safeParse("double--hyphen").success).toBe(false);
    expect(tenantSlugSchema.safeParse("-leading").success).toBe(false);
    expect(tenantSlugSchema.safeParse("trailing-").success).toBe(false);
  });

  it("rejects too-short input", () => {
    expect(tenantSlugSchema.safeParse("ab").success).toBe(false);
  });
});

describe("tenantDisplayNameSchema", () => {
  it("rejects empty/whitespace-only names", () => {
    expect(tenantDisplayNameSchema.safeParse("   ").success).toBe(false);
    expect(tenantDisplayNameSchema.safeParse("").success).toBe(false);
  });

  it("accepts a normal company name", () => {
    expect(tenantDisplayNameSchema.safeParse("PT Contoh Pelayaran").success).toBe(true);
  });
});

describe("bootstrapEmailSchema", () => {
  it("normalizes to lowercase", () => {
    const parsed = bootstrapEmailSchema.safeParse("Owner@Example.com");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("owner@example.com");
    }
  });

  it("rejects invalid email format", () => {
    expect(bootstrapEmailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
