import { z } from "zod";
import { idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const clientInputSchema = z.object({
  clientCode: optionalText(50),
  displayName: requiredText(200, "Nama client wajib diisi."),
  legalName: optionalText(200),
  address: optionalText(500),
  taxIdentifier: optionalText(50),
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
  });
}
