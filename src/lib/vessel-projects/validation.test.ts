import { describe, expect, it } from "vitest";
import { createVesselProjectInputSchema, transitionVesselProjectInputSchema } from "./validation";

const VALID_ID = "11111111-1111-4111-8111-111111111111";

describe("createVesselProjectInputSchema", () => {
  it("requires vesselId, clientId, serviceTypeId, facilityLocationId, and startDate", () => {
    expect(createVesselProjectInputSchema.safeParse({}).success).toBe(false);
    expect(
      createVesselProjectInputSchema.safeParse({
        vesselId: VALID_ID,
        clientId: VALID_ID,
        serviceTypeId: VALID_ID,
        // facilityLocationId missing
        startDate: "2026-01-15",
      }).success,
    ).toBe(false);
  });

  it("accepts a minimal valid input without projectCode", () => {
    const result = createVesselProjectInputSchema.safeParse({
      vesselId: VALID_ID,
      clientId: VALID_ID,
      serviceTypeId: VALID_ID,
      facilityLocationId: VALID_ID,
      startDate: "2026-01-15",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.projectCode).toBeUndefined();
  });

  it("rejects a malformed startDate", () => {
    const result = createVesselProjectInputSchema.safeParse({
      vesselId: VALID_ID,
      clientId: VALID_ID,
      serviceTypeId: VALID_ID,
      facilityLocationId: VALID_ID,
      startDate: "15/01/2026",
    });
    expect(result.success).toBe(false);
  });

  it("treats an empty projectCode as undefined, not a validation error", () => {
    const result = createVesselProjectInputSchema.safeParse({
      vesselId: VALID_ID,
      clientId: VALID_ID,
      serviceTypeId: VALID_ID,
      facilityLocationId: VALID_ID,
      startDate: "2026-01-15",
      projectCode: "",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.projectCode).toBeUndefined();
  });
});

describe("transitionVesselProjectInputSchema", () => {
  it("requires id and a valid toStatus", () => {
    expect(transitionVesselProjectInputSchema.safeParse({ id: VALID_ID }).success).toBe(false);
    expect(
      transitionVesselProjectInputSchema.safeParse({ id: VALID_ID, toStatus: "cancelled" }).success,
    ).toBe(false);
  });

  it("accepts a valid transition without a reason", () => {
    const result = transitionVesselProjectInputSchema.safeParse({ id: VALID_ID, toStatus: "ready_to_close" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.reason).toBeUndefined();
  });

  it("accepts an optional reason", () => {
    const result = transitionVesselProjectInputSchema.safeParse({
      id: VALID_ID,
      toStatus: "closed",
      reason: "pekerjaan selesai",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.reason).toBe("pekerjaan selesai");
  });
});
