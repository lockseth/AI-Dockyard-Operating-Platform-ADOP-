import { describe, expect, it } from "vitest";
import {
  createClientContactInputSchema,
  parseCreateClientContactFormData,
  parseUpdateClientContactFormData,
  updateClientContactInputSchema,
} from "./validation";

const VALID_CLIENT_ID = "11111111-1111-4111-8111-111111111111";

describe("createClientContactInputSchema", () => {
  it("requires clientId and fullName", () => {
    expect(createClientContactInputSchema.safeParse({ fullName: "Budi" }).success).toBe(false);
    expect(
      createClientContactInputSchema.safeParse({ clientId: VALID_CLIENT_ID, fullName: "" }).success,
    ).toBe(false);
  });

  it("rejects a non-UUID clientId", () => {
    expect(
      createClientContactInputSchema.safeParse({ clientId: "not-a-uuid", fullName: "Budi" }).success,
    ).toBe(false);
  });

  it("defaults isPrimary and every recipient flag to false when not provided", () => {
    const result = createClientContactInputSchema.safeParse({
      clientId: VALID_CLIENT_ID,
      fullName: "Budi",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isPrimary).toBe(false);
    expect(result.success && result.data.receivesInvoiceWhatsapp).toBe(false);
    expect(result.success && result.data.receivesInvoiceEmail).toBe(false);
    expect(result.success && result.data.receivesCollectionReminder).toBe(false);
    expect(result.success && result.data.role).toBeUndefined();
  });

  it("accepts a valid role and rejects an invalid one", () => {
    expect(
      createClientContactInputSchema.safeParse({ clientId: VALID_CLIENT_ID, fullName: "Budi", role: "billing" })
        .success,
    ).toBe(true);
    expect(
      createClientContactInputSchema.safeParse({ clientId: VALID_CLIENT_ID, fullName: "Budi", role: "manager" })
        .success,
    ).toBe(false);
  });

  it("accepts a valid email and rejects an invalid one", () => {
    expect(
      createClientContactInputSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        fullName: "Budi",
        email: "budi@example.com",
      }).success,
    ).toBe(true);
    expect(
      createClientContactInputSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        fullName: "Budi",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });
});

describe("updateClientContactInputSchema", () => {
  it("does not accept/require clientId — it is immutable after creation", () => {
    const shape = updateClientContactInputSchema.safeParse({ fullName: "Budi", isPrimary: true });
    expect(shape.success).toBe(true);
    expect(shape.success && "clientId" in shape.data).toBe(false);
  });
});

describe("parseCreateClientContactFormData", () => {
  it("reads isPrimary from a checked checkbox value of 'on'", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("fullName", "Budi Santoso");
    formData.set("isPrimary", "on");

    const result = parseCreateClientContactFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.isPrimary).toBe(true);
  });

  it("treats an absent checkbox field as false", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("fullName", "Budi Santoso");

    const result = parseCreateClientContactFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.isPrimary).toBe(false);
  });

  it("reads every recipient checkbox and the role select", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("fullName", "Budi Santoso");
    formData.set("role", "billing");
    formData.set("receivesInvoiceWhatsapp", "on");
    formData.set("receivesInvoiceEmail", "on");

    const result = parseCreateClientContactFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.role).toBe("billing");
    expect(result.success && result.data.receivesInvoiceWhatsapp).toBe(true);
    expect(result.success && result.data.receivesInvoiceEmail).toBe(true);
    expect(result.success && result.data.receivesCollectionReminder).toBe(false);
  });
});

describe("parseUpdateClientContactFormData", () => {
  it("never includes clientId in the parsed shape, even if present in the FormData", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("fullName", "Budi Santoso");

    const result = parseUpdateClientContactFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && "clientId" in result.data).toBe(false);
  });
});
