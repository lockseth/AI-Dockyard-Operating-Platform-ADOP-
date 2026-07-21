import { describe, expect, it } from "vitest";
import { facilityLocationInputSchema, parseFacilityLocationFormData } from "./validation";

describe("facilityLocationInputSchema", () => {
  it("requires name but not code — facility locations remain open discovery", () => {
    expect(facilityLocationInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(facilityLocationInputSchema.safeParse({ name: "Dermaga 1" }).success).toBe(true);
  });

  it("rejects a bare generic \"PLTU\" name (case-insensitive, trimmed) — it is a category, not a location", () => {
    expect(facilityLocationInputSchema.safeParse({ name: "PLTU" }).success).toBe(false);
    expect(facilityLocationInputSchema.safeParse({ name: "pltu" }).success).toBe(false);
    expect(facilityLocationInputSchema.safeParse({ name: "  PLTU  " }).success).toBe(false);
  });

  it("accepts a specific PLTU site name", () => {
    expect(facilityLocationInputSchema.safeParse({ name: "PLTU Kanci" }).success).toBe(true);
  });
});

describe("parseFacilityLocationFormData", () => {
  it("treats an empty code as undefined, not a fabricated value", () => {
    const formData = new FormData();
    formData.set("name", "Dermaga 1");
    formData.set("code", "");

    const result = parseFacilityLocationFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.code).toBeUndefined();
  });
});
