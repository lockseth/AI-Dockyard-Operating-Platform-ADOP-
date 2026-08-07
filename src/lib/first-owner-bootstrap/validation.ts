import { z } from "zod";

// Mirrors the shape of every other locked tenant slug in this codebase
// (e.g. "pt-pelayaran-gema-bahari-demo"): lowercase, digits, hyphens only,
// no leading/trailing/doubled hyphen. tenants.slug itself has no format
// constraint in the database (just unique) — this is an app-level floor so
// an operator typo can't produce an unreadable or URL-hostile slug.
export const tenantSlugSchema = z
  .string()
  .trim()
  .min(3, "Slug tenant minimal 3 karakter.")
  .max(63, "Slug tenant maksimal 63 karakter.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Slug tenant hanya boleh huruf kecil, angka, dan tanda hubung tunggal.",
  );

export const tenantDisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Nama tenant wajib diisi.")
  .max(200, "Nama tenant maksimal 200 karakter.");

export const bootstrapEmailSchema = z
  .string()
  .trim()
  .min(1, "Email wajib diisi.")
  .email("Format email tidak valid.")
  .transform((value) => value.toLowerCase());

export const issuanceInputSchema = z.object({
  tenantSlug: tenantSlugSchema,
  tenantDisplayName: tenantDisplayNameSchema,
  email: bootstrapEmailSchema,
});

export type IssuanceInputParsed = z.infer<typeof issuanceInputSchema>;
