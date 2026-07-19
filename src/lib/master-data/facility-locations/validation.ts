import { z } from "zod";
import { idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const facilityLocationInputSchema = z.object({
  code: optionalText(50),
  name: requiredText(200, "Nama lokasi wajib diisi."),
  description: optionalText(500),
});
export type FacilityLocationInput = z.infer<typeof facilityLocationInputSchema>;

export const facilityLocationStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export function parseFacilityLocationFormData(formData: FormData) {
  return facilityLocationInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
}
