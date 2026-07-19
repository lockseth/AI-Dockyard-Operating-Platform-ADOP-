import { z } from "zod";
import { idSchema, optionalEmail, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

const contactFieldsSchema = z.object({
  fullName: requiredText(200, "Nama PIC wajib diisi."),
  positionDepartment: optionalText(200),
  email: optionalEmail(),
  whatsappNumber: optionalText(30),
  isPrimary: z.boolean().default(false),
});

export const createClientContactInputSchema = contactFieldsSchema.extend({
  clientId: idSchema,
});
export type CreateClientContactInput = z.infer<typeof createClientContactInputSchema>;

export const updateClientContactInputSchema = contactFieldsSchema;
export type UpdateClientContactInput = z.infer<typeof updateClientContactInputSchema>;

export const clientContactStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

function isPrimaryFromFormData(formData: FormData): boolean {
  return formData.get("isPrimary") === "on" || formData.get("isPrimary") === "true";
}

export function parseCreateClientContactFormData(formData: FormData) {
  return createClientContactInputSchema.safeParse({
    clientId: formData.get("clientId"),
    fullName: formData.get("fullName"),
    positionDepartment: formData.get("positionDepartment"),
    email: formData.get("email"),
    whatsappNumber: formData.get("whatsappNumber"),
    isPrimary: isPrimaryFromFormData(formData),
  });
}

export function parseUpdateClientContactFormData(formData: FormData) {
  return updateClientContactInputSchema.safeParse({
    fullName: formData.get("fullName"),
    positionDepartment: formData.get("positionDepartment"),
    email: formData.get("email"),
    whatsappNumber: formData.get("whatsappNumber"),
    isPrimary: isPrimaryFromFormData(formData),
  });
}
