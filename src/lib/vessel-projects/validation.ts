import { z } from "zod";
import { idSchema, optionalText } from "@/lib/master-data/shared/validation";

export const vesselProjectLifecycleStatusSchema = z.enum(["active", "ready_to_close", "closed"]);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid (YYYY-MM-DD).");

export const createVesselProjectInputSchema = z.object({
  vesselId: idSchema,
  clientId: idSchema,
  serviceTypeId: idSchema,
  facilityLocationId: idSchema,
  projectCode: optionalText(50),
  startDate: isoDateSchema,
});
export type CreateVesselProjectInput = z.infer<typeof createVesselProjectInputSchema>;

export const transitionVesselProjectInputSchema = z.object({
  id: idSchema,
  toStatus: vesselProjectLifecycleStatusSchema,
  reason: optionalText(500),
});
export type TransitionVesselProjectInput = z.infer<typeof transitionVesselProjectInputSchema>;
