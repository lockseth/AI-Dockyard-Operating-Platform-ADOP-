import { describe, expect, it } from "vitest";
import { parseServiceTypeFormData, serviceTypeInputSchema } from "./validation";

describe("serviceTypeInputSchema", () => {
  it("requires code and name", () => {
    expect(serviceTypeInputSchema.safeParse({ code: "", name: "Emergency" }).success).toBe(false);
    expect(serviceTypeInputSchema.safeParse({ code: "emergency", name: "" }).success).toBe(false);
  });

  it("defaults sortOrder to 0 when not provided", () => {
    const result = serviceTypeInputSchema.safeParse({ code: "emergency", name: "Emergency" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sortOrder).toBe(0);
  });

  it("coerces a string sortOrder from FormData into a number", () => {
    const result = serviceTypeInputSchema.safeParse({ code: "emergency", name: "Emergency", sortOrder: "3" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sortOrder).toBe(3);
  });

  it("rejects a negative sortOrder", () => {
    const result = serviceTypeInputSchema.safeParse({ code: "emergency", name: "Emergency", sortOrder: -1 });
    expect(result.success).toBe(false);
  });
});

describe("parseServiceTypeFormData", () => {
  it("falls back to sortOrder 0 when the field is missing from FormData", () => {
    const formData = new FormData();
    formData.set("code", "emergency");
    formData.set("name", "Emergency");

    const result = parseServiceTypeFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.sortOrder).toBe(0);
  });
});
