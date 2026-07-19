import { describe, expect, it } from "vitest";
import { idSchema, optionalEmail, optionalText, recordStatusSchema, requiredText } from "./validation";

describe("requiredText", () => {
  const schema = requiredText(10, "Wajib diisi.");

  it("accepts a non-empty trimmed string within the max length", () => {
    expect(schema.safeParse("hello").success).toBe(true);
  });

  it("rejects an empty string", () => {
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    const result = schema.safeParse("   ");
    expect(result.success).toBe(false);
  });

  it("rejects a string longer than the max length", () => {
    const result = schema.safeParse("this is way too long");
    expect(result.success).toBe(false);
  });

  it("rejects null (FormData.get returning null for a missing field)", () => {
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe("optionalText", () => {
  const schema = optionalText(10);

  it("treats an empty string as undefined (not provided)", () => {
    const result = schema.safeParse("");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeUndefined();
  });

  it("treats a whitespace-only string as undefined", () => {
    const result = schema.safeParse("   ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeUndefined();
  });

  it("keeps a non-empty trimmed value", () => {
    const result = schema.safeParse("  value  ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("value");
  });

  it("rejects a value longer than the max length", () => {
    expect(schema.safeParse("this is way too long").success).toBe(false);
  });
});

describe("optionalEmail", () => {
  const schema = optionalEmail();

  it("treats an empty string as undefined", () => {
    const result = schema.safeParse("");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBeUndefined();
  });

  it("accepts a valid email", () => {
    const result = schema.safeParse("owner@example.com");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("owner@example.com");
  });

  it("rejects an invalid email", () => {
    expect(schema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("recordStatusSchema", () => {
  it("accepts active and inactive", () => {
    expect(recordStatusSchema.safeParse("active").success).toBe(true);
    expect(recordStatusSchema.safeParse("inactive").success).toBe(true);
  });

  it("rejects any other value", () => {
    expect(recordStatusSchema.safeParse("deleted").success).toBe(false);
    expect(recordStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("idSchema", () => {
  it("accepts a valid UUID", () => {
    expect(idSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
  });

  it("rejects a non-UUID string", () => {
    expect(idSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("rejects null", () => {
    expect(idSchema.safeParse(null).success).toBe(false);
  });
});
