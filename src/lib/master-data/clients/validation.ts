import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const invoiceDeliveryChannelSchema = z.enum(["whatsapp", "email", "both"]);

const optionalPaymentTermDays = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive("Jangka waktu pembayaran harus lebih dari 0 hari.").optional(),
);

const optionalInvoiceDeliveryPreference = z.preprocess(emptyToUndefined, invoiceDeliveryChannelSchema.optional());

export const clientInputSchema = z.object({
  clientCode: optionalText(50),
  displayName: requiredText(200, "Nama client wajib diisi."),
  legalName: optionalText(200),
  address: optionalText(500),
  taxIdentifier: optionalText(50),
  defaultPaymentTermDays: optionalPaymentTermDays,
  invoiceDeliveryPreference: optionalInvoiceDeliveryPreference,
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export const clientStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export type ClientStatusInput = z.infer<typeof clientStatusInputSchema>;

export function parseClientFormData(formData: FormData) {
  return clientInputSchema.safeParse({
    clientCode: formData.get("clientCode"),
    displayName: formData.get("displayName"),
    legalName: formData.get("legalName"),
    address: formData.get("address"),
    taxIdentifier: formData.get("taxIdentifier"),
    defaultPaymentTermDays: formData.get("defaultPaymentTermDays"),
    invoiceDeliveryPreference: formData.get("invoiceDeliveryPreference"),
  });
}
