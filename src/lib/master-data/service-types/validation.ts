import { z } from "zod";
import { idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const serviceTypeInputSchema = z.object({
  code: requiredText(50, "Kode wajib diisi."),
  name: requiredText(200, "Nama wajib diisi."),
  description: optionalText(500),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type ServiceTypeInput = z.infer<typeof serviceTypeInputSchema>;

export const serviceTypeStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export function parseServiceTypeFormData(formData: FormData) {
  return serviceTypeInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder") || 0,
  });
}
