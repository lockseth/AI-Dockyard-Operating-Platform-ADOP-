import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";

// Matches shared_overhead_allocations.amount (numeric(16,2), amount > 0):
// positive, at most 2 decimal places. Server-side coercion so both a raw
// number and a FormData string input are accepted.
const amountSchema = z.coerce
  .number({ message: "Nominal alokasi wajib diisi." })
  .positive("Nominal alokasi harus lebih besar dari nol.")
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-6, "Maksimal 2 angka desimal.")
  .refine((value) => value < 1_000_000_000_000, "Nominal terlalu besar.");

export const allocateSharedOverheadEntryInputSchema = z.object({
  overheadEntryId: idSchema,
  projectId: idSchema,
  amount: amountSchema,
  note: optionalText(500),
});
export type AllocateSharedOverheadEntryInput = z.infer<typeof allocateSharedOverheadEntryInputSchema>;

export const reverseSharedOverheadAllocationInputSchema = z.object({
  allocationId: idSchema,
  reason: requiredText(500, "Alasan pembatalan alokasi wajib diisi."),
});
export type ReverseSharedOverheadAllocationInput = z.infer<typeof reverseSharedOverheadAllocationInputSchema>;
