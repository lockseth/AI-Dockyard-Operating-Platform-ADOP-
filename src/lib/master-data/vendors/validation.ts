import { z } from "zod";
import { idSchema, optionalEmail, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

export const vendorInputSchema = z.object({
  vendorCode: optionalText(50),
  displayName: requiredText(200, "Nama vendor wajib diisi."),
  contactName: optionalText(200),
  email: optionalEmail(),
  phone: optionalText(30),
  address: optionalText(500),
});
export type VendorInput = z.infer<typeof vendorInputSchema>;

export const vendorStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export function parseVendorFormData(formData: FormData) {
  return vendorInputSchema.safeParse({
    vendorCode: formData.get("vendorCode"),
    displayName: formData.get("displayName"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
}
