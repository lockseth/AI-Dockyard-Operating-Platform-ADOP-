import { describe, expect, it } from "vitest";
import { parseVendorFormData, vendorInputSchema } from "./validation";

describe("vendorInputSchema", () => {
  it("requires displayName", () => {
    expect(vendorInputSchema.safeParse({ displayName: "" }).success).toBe(false);
  });

  it("accepts a minimal valid input", () => {
    expect(vendorInputSchema.safeParse({ displayName: "CV Sumber Baja" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      vendorInputSchema.safeParse({ displayName: "CV Sumber Baja", email: "not-an-email" }).success,
    ).toBe(false);
  });
});

describe("parseVendorFormData", () => {
  it("never reads tenantId or createdBy even if present in FormData", () => {
    const formData = new FormData();
    formData.set("displayName", "CV Sumber Baja");
    formData.set("tenantId", "11111111-1111-4111-8111-111111111111");
    formData.set("createdBy", "22222222-2222-4222-8222-222222222222");

    const result = parseVendorFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("tenantId");
    expect(result.success && result.data).not.toHaveProperty("createdBy");
  });
});
