import { z } from "zod";
import { idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

const vesselFieldsSchema = z.object({
  vesselCode: optionalText(50),
  vesselName: requiredText(200, "Nama kapal wajib diisi."),
  registrationNumber: optionalText(100),
  vesselType: optionalText(100),
});

export const createVesselInputSchema = vesselFieldsSchema.extend({
  clientId: idSchema,
});
export type CreateVesselInput = z.infer<typeof createVesselInputSchema>;

export const updateVesselInputSchema = vesselFieldsSchema;
export type UpdateVesselInput = z.infer<typeof updateVesselInputSchema>;

export const vesselStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export function parseCreateVesselFormData(formData: FormData) {
  return createVesselInputSchema.safeParse({
    clientId: formData.get("clientId"),
    vesselCode: formData.get("vesselCode"),
    vesselName: formData.get("vesselName"),
    registrationNumber: formData.get("registrationNumber"),
    vesselType: formData.get("vesselType"),
  });
}

export function parseUpdateVesselFormData(formData: FormData) {
  return updateVesselInputSchema.safeParse({
    vesselCode: formData.get("vesselCode"),
    vesselName: formData.get("vesselName"),
    registrationNumber: formData.get("registrationNumber"),
    vesselType: formData.get("vesselType"),
  });
}
