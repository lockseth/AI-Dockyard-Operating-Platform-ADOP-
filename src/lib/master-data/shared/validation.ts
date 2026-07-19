import { z } from "zod";

// FormData.get() returns either a string or null (never undefined) — an
// empty string OR a genuinely absent field both mean "not provided", so
// every optional field is preprocessed to undefined before Zod's own
// `.optional()` sees it. Zod's `.optional()` only accepts undefined, not
// null, so leaving null unmapped here would fail validation on any field a
// form legitimately omits.
export function emptyToUndefined(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }
  return typeof value === "string" && value.trim().length === 0 ? undefined : value;
}

export function requiredText(maxLength: number, message = "Wajib diisi.") {
  return z.string().trim().min(1, message).max(maxLength, `Maksimal ${maxLength} karakter.`);
}

export function optionalText(maxLength: number) {
  return z.preprocess(
    emptyToUndefined,
    z.string().trim().max(maxLength, `Maksimal ${maxLength} karakter.`).optional(),
  );
}

export function optionalEmail() {
  return z.preprocess(
    emptyToUndefined,
    z.string().trim().email("Format email tidak valid.").max(200).optional(),
  );
}

export const recordStatusSchema = z.enum(["active", "inactive"]);

export const idSchema = z.string().uuid("ID tidak valid.");
