import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText } from "@/lib/master-data/shared/validation";

export const vesselProjectLifecycleStatusSchema = z.enum(["active", "ready_to_close", "closed"]);
export const vesselProjectPrioritySchema = z.enum(["emergency", "standard", "urgent"]);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid (YYYY-MM-DD).");

// Facility Location is optional (LOCK H.1) — not every Project Kapal has
// one. Priority is required: the create form always sends an explicit
// value, defaulting the select to 'standard' rather than leaving it unset.
export const createVesselProjectInputSchema = z.object({
  vesselId: idSchema,
  clientId: idSchema,
  serviceTypeId: idSchema,
  facilityLocationId: z.preprocess(emptyToUndefined, idSchema.optional()),
  projectCode: optionalText(50),
  startDate: isoDateSchema,
  priority: vesselProjectPrioritySchema,
});
export type CreateVesselProjectInput = z.infer<typeof createVesselProjectInputSchema>;

export const transitionVesselProjectInputSchema = z.object({
  id: idSchema,
  toStatus: vesselProjectLifecycleStatusSchema,
  reason: optionalText(500),
});
export type TransitionVesselProjectInput = z.infer<typeof transitionVesselProjectInputSchema>;

export const setVesselProjectPriorityInputSchema = z.object({
  id: idSchema,
  priority: vesselProjectPrioritySchema,
});
export type SetVesselProjectPriorityInput = z.infer<typeof setVesselProjectPriorityInputSchema>;
