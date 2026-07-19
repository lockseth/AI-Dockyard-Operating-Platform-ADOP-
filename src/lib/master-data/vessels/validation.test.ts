import { describe, expect, it } from "vitest";
import {
  createVesselInputSchema,
  parseCreateVesselFormData,
  parseUpdateVesselFormData,
  updateVesselInputSchema,
} from "./validation";

const VALID_CLIENT_ID = "11111111-1111-4111-8111-111111111111";

describe("createVesselInputSchema", () => {
  it("requires clientId and vesselName", () => {
    expect(createVesselInputSchema.safeParse({ vesselName: "KM Test" }).success).toBe(false);
    expect(
      createVesselInputSchema.safeParse({ clientId: VALID_CLIENT_ID, vesselName: "" }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid input", () => {
    const result = createVesselInputSchema.safeParse({
      clientId: VALID_CLIENT_ID,
      vesselName: "KM Nusantara Jaya",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateVesselInputSchema", () => {
  it("does not accept/require clientId — it is immutable after creation", () => {
    const result = updateVesselInputSchema.safeParse({ vesselName: "KM Nusantara Jaya" });
    expect(result.success).toBe(true);
    expect(result.success && "clientId" in result.data).toBe(false);
  });
});

describe("parseUpdateVesselFormData", () => {
  it("never includes clientId in the parsed shape even if present in FormData", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("vesselName", "KM Nusantara Jaya");

    const result = parseUpdateVesselFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && "clientId" in result.data).toBe(false);
  });
});

describe("parseCreateVesselFormData", () => {
  it("parses optional fields as undefined when empty", () => {
    const formData = new FormData();
    formData.set("clientId", VALID_CLIENT_ID);
    formData.set("vesselName", "KM Nusantara Jaya");
    formData.set("vesselCode", "");

    const result = parseCreateVesselFormData(formData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.vesselCode).toBeUndefined();
  });
});
