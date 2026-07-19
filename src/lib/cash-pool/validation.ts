import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";

export const cashPoolEntryTypeSchema = z.enum(["opening_cash", "cash_top_up", "other_cash_in"]);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid (YYYY-MM-DD).");

// Matches the cash_pool_entries.amount column (numeric(16,2), amount > 0):
// positive, at most 2 decimal places. Server-side coercion so both a raw
// number and a FormData string input are accepted.
const amountSchema = z.coerce
  .number({ message: "Nominal wajib diisi." })
  .positive("Nominal harus lebih besar dari nol.")
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-6, "Maksimal 2 angka desimal.")
  .refine((value) => value < 1_000_000_000_000, "Nominal terlalu besar.");

export const getOrCreateDailyCashPoolInputSchema = z.object({
  businessDate: isoDateSchema,
});
export type GetOrCreateDailyCashPoolInput = z.infer<typeof getOrCreateDailyCashPoolInputSchema>;

export const recordCashPoolEntryInputSchema = z.object({
  poolId: idSchema,
  entryType: cashPoolEntryTypeSchema,
  amount: amountSchema,
  description: optionalText(500),
});
export type RecordCashPoolEntryInput = z.infer<typeof recordCashPoolEntryInputSchema>;

export const reverseCashPoolEntryInputSchema = z.object({
  entryId: idSchema,
  reason: requiredText(500, "Alasan koreksi wajib diisi."),
});
export type ReverseCashPoolEntryInput = z.infer<typeof reverseCashPoolEntryInputSchema>;
