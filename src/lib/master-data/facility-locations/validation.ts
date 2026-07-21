import { z } from "zod";
import { idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

// "PLTU" generic is not a valid facility location — it is a category, not a
// physical place (LOCK H.2). A specific site name like "PLTU Kanci" is
// valid and unaffected: only an exact (trimmed, case-insensitive) match on
// the bare word is rejected.
const GENERIC_PLTU_PATTERN = /^pltu$/i;

export const facilityLocationInputSchema = z.object({
  code: optionalText(50),
  name: requiredText(200, "Nama lokasi wajib diisi.").refine(
    (value) => !GENERIC_PLTU_PATTERN.test(value),
    "\"PLTU\" generik tidak valid sebagai facility location — gunakan nama lokasi spesifik, mis. \"PLTU Kanci\".",
  ),
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
