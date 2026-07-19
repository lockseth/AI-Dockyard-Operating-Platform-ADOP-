import { describe, expect, it } from "vitest";
import {
  createExpenseCategoryInputSchema,
  parseCreateExpenseCategoryFormData,
  parseUpdateExpenseCategoryFormData,
  updateExpenseCategoryInputSchema,
} from "./validation";

const VALID_PARENT_ID = "11111111-1111-4111-8111-111111111111";

describe("createExpenseCategoryInputSchema", () => {
  it("requires code and name", () => {
    expect(createExpenseCategoryInputSchema.safeParse({ code: "", name: "Material" }).success).toBe(false);
  });

  it("treats an empty parentId as undefined (top-level category)", () => {
    const result = createExpenseCategoryInputSchema.safeParse({ code: "MAT", name: "Material", parentId: "" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.parentId).toBeUndefined();
  });

  it("rejects a non-UUID parentId", () => {
    expect(
      createExpenseCategoryInputSchema.safeParse({ code: "MAT", name: "Material", parentId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("accepts a valid parentId", () => {
    const result = createExpenseCategoryInputSchema.safeParse({
      code: "MAT-STEEL",
      name: "Steel",
      parentId: VALID_PARENT_ID,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateExpenseCategoryInputSchema", () => {
  it("does not accept/require parentId — it is immutable after creation", () => {
    const result = updateExpenseCategoryInputSchema.safeParse({ code: "MAT", name: "Material" });
    expect(result.success).toBe(true);
    expect(result.success && "parentId" in result.data).toBe(false);
  });
});

describe("parseUpdateExpenseCategoryFormData", () => {
  it("never includes parentId in the parsed shape even if present in FormData", () => {
    const formData = new FormData();
    formData.set("parentId", VALID_PARENT_ID);
    formData.set("code", "MAT");
    formData.set("name", "Material");

    const result = parseUpdateExpenseCategoryFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && "parentId" in result.data).toBe(false);
  });
});

describe("parseCreateExpenseCategoryFormData", () => {
  it("parses a top-level category (no parentId field at all)", () => {
    const formData = new FormData();
    formData.set("code", "MAT");
    formData.set("name", "Material");

    const result = parseCreateExpenseCategoryFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.parentId).toBeUndefined();
  });
});
