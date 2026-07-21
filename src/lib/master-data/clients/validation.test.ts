import { describe, expect, it } from "vitest";
import { clientInputSchema, parseClientFormData } from "./validation";

describe("clientInputSchema", () => {
  it("requires displayName", () => {
    const result = clientInputSchema.safeParse({ displayName: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid input with only displayName", () => {
    const result = clientInputSchema.safeParse({ displayName: "PT Kapal Nusantara" });
    expect(result.success).toBe(true);
  });

  it("treats empty optional fields as undefined, not empty string", () => {
    const result = clientInputSchema.safeParse({
      displayName: "PT Kapal Nusantara",
      clientCode: "",
      legalName: "",
      address: "",
      taxIdentifier: "",
      defaultPaymentTermDays: "",
      invoiceDeliveryPreference: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.clientCode).toBeUndefined();
      expect(result.data.legalName).toBeUndefined();
      expect(result.data.defaultPaymentTermDays).toBeUndefined();
      expect(result.data.invoiceDeliveryPreference).toBeUndefined();
    }
  });

  it("accepts a valid defaultPaymentTermDays and invoiceDeliveryPreference", () => {
    const result = clientInputSchema.safeParse({
      displayName: "PT Kapal Nusantara",
      defaultPaymentTermDays: "30",
      invoiceDeliveryPreference: "both",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultPaymentTermDays).toBe(30);
      expect(result.data.invoiceDeliveryPreference).toBe("both");
    }
  });

  it("rejects a non-positive defaultPaymentTermDays", () => {
    const result = clientInputSchema.safeParse({
      displayName: "PT Kapal Nusantara",
      defaultPaymentTermDays: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid invoiceDeliveryPreference value", () => {
    const result = clientInputSchema.safeParse({
      displayName: "PT Kapal Nusantara",
      invoiceDeliveryPreference: "fax",
    });
    expect(result.success).toBe(false);
  });
});

describe("parseClientFormData", () => {
  it("parses a FormData payload the same as a plain object", () => {
    const formData = new FormData();
    formData.set("displayName", "PT Kapal Nusantara");
    formData.set("clientCode", "CL-001");

    const result = parseClientFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("PT Kapal Nusantara");
      expect(result.data.clientCode).toBe("CL-001");
    }
  });

  it("never includes tenantId or createdBy in the parsed shape", () => {
    const formData = new FormData();
    formData.set("displayName", "PT Kapal Nusantara");
    formData.set("tenantId", "44444444-4444-4444-4444-444444444444");
    formData.set("createdBy", "11111111-1111-4111-8111-111111111111");

    const result = parseClientFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("tenantId");
      expect(result.data).not.toHaveProperty("createdBy");
    }
  });

  it("rejects missing displayName (FormData.get returning null)", () => {
    const formData = new FormData();
    const result = parseClientFormData(formData);
    expect(result.success).toBe(false);
  });
});
