import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";

// Matches the project_cost_ledger_entries.amount column (numeric(16,2),
// amount > 0): positive, at most 2 decimal places. Server-side coercion so
// both a raw number and a FormData string input are accepted.
const amountSchema = z.coerce
  .number({ message: "Nominal wajib diisi." })
  .positive("Nominal harus lebih besar dari nol.")
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-6, "Maksimal 2 angka desimal.")
  .refine((value) => value < 1_000_000_000_000, "Nominal terlalu besar.");

const optionalIdSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  idSchema.optional(),
);

export const recordProjectExpenseInputSchema = z.object({
  poolId: idSchema,
  projectId: idSchema,
  categoryId: idSchema,
  amount: amountSchema,
  description: requiredText(500, "Keterangan wajib diisi."),
  vendorId: optionalIdSchema,
  referenceNumber: optionalText(100),
});
export type RecordProjectExpenseInput = z.infer<typeof recordProjectExpenseInputSchema>;

export const reverseProjectExpenseInputSchema = z.object({
  entryId: idSchema,
  reason: requiredText(500, "Alasan koreksi wajib diisi."),
});
export type ReverseProjectExpenseInput = z.infer<typeof reverseProjectExpenseInputSchema>;
