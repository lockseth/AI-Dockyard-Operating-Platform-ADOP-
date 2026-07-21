import { z } from "zod";
import { emptyToUndefined, idSchema, optionalEmail, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const clientContactRoleSchema = z.enum(["operational", "billing", "finance", "approver", "other"]);

const contactFieldsSchema = z.object({
  fullName: requiredText(200, "Nama PIC wajib diisi."),
  positionDepartment: optionalText(200),
  email: optionalEmail(),
  whatsappNumber: optionalText(30),
  isPrimary: z.boolean().default(false),
  role: z.preprocess(emptyToUndefined, clientContactRoleSchema.optional()),
  receivesInvoiceWhatsapp: z.boolean().default(false),
  receivesInvoiceEmail: z.boolean().default(false),
  receivesCollectionReminder: z.boolean().default(false),
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

function checkboxValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

export function parseCreateClientContactFormData(formData: FormData) {
  return createClientContactInputSchema.safeParse({
    clientId: formData.get("clientId"),
    fullName: formData.get("fullName"),
    positionDepartment: formData.get("positionDepartment"),
    email: formData.get("email"),
    whatsappNumber: formData.get("whatsappNumber"),
    isPrimary: checkboxValue(formData, "isPrimary"),
    role: formData.get("role"),
    receivesInvoiceWhatsapp: checkboxValue(formData, "receivesInvoiceWhatsapp"),
    receivesInvoiceEmail: checkboxValue(formData, "receivesInvoiceEmail"),
    receivesCollectionReminder: checkboxValue(formData, "receivesCollectionReminder"),
  });
}

export function parseUpdateClientContactFormData(formData: FormData) {
  return updateClientContactInputSchema.safeParse({
    fullName: formData.get("fullName"),
    positionDepartment: formData.get("positionDepartment"),
    email: formData.get("email"),
    whatsappNumber: formData.get("whatsappNumber"),
    isPrimary: checkboxValue(formData, "isPrimary"),
    role: formData.get("role"),
    receivesInvoiceWhatsapp: checkboxValue(formData, "receivesInvoiceWhatsapp"),
    receivesInvoiceEmail: checkboxValue(formData, "receivesInvoiceEmail"),
    receivesCollectionReminder: checkboxValue(formData, "receivesCollectionReminder"),
  });
}
