import { z } from "zod";
import { requiredText } from "@/lib/master-data/shared/validation";
import { containsForbiddenOwnerLiteral } from "./identity";

export const ownerEmailSchema = z
  .string()
  .trim()
  .min(1, "Email wajib diisi.")
  .email("Format email tidak valid.")
  .max(255)
  .transform((value) => value.toLowerCase());

export const ownerDisplayNameSchema = requiredText(200, "Nama wajib diisi.").refine(
  (value) => !containsForbiddenOwnerLiteral(value),
  "Nama internal Founder owner tidak boleh menggunakan nama Pak Hanafi.",
);

// Minimum bar for a privileged demo account, not a general password-strength
// policy: length plus at least one letter and one digit.
export const ownerPasswordSchema = z
  .string()
  .min(12, "Password minimal 12 karakter.")
  .max(200, "Password maksimal 200 karakter.")
  .refine(
    (value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value),
    "Password harus mengandung huruf dan angka.",
  );

// Dry-run's schema: no password, because dry-run never prompts for, needs,
// or validates one — see cli-flow.ts's collectIdentityInput.
export const ownerIdentityFieldsSchema = z.object({
  email: ownerEmailSchema,
  displayName: ownerDisplayNameSchema,
});

export type OwnerIdentityFieldsInput = z.infer<typeof ownerIdentityFieldsSchema>;

// Apply-only superset: everything dry-run validates, plus the password.
export const ownerBootstrapIdentitySchema = ownerIdentityFieldsSchema.extend({
  password: ownerPasswordSchema,
});

export type OwnerBootstrapIdentityInput = z.infer<typeof ownerBootstrapIdentitySchema>;
