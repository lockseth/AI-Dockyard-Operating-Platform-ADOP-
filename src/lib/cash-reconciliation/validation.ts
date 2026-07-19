import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";

// Matches cash_reconciliation_revisions.actual_counted_cash (numeric(16,2),
// actual_counted_cash >= 0): non-negative, at most 2 decimal places. Server-
// side coercion so both a raw number and a FormData string input are
// accepted.
const actualCountedCashSchema = z.coerce
  .number({ message: "Nominal kas fisik wajib diisi." })
  .min(0, "Nominal kas fisik tidak boleh negatif.")
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-6, "Maksimal 2 angka desimal.")
  .refine((value) => value < 1_000_000_000_000, "Nominal terlalu besar.");

const cashReconciliationDraftFieldsSchema = {
  actualCountedCash: actualCountedCashSchema,
  explanation: optionalText(1000),
};

export const createCashReconciliationDraftInputSchema = z.object({
  poolId: idSchema,
  ...cashReconciliationDraftFieldsSchema,
});
export type CreateCashReconciliationDraftInput = z.infer<typeof createCashReconciliationDraftInputSchema>;

export const reviseCashReconciliationDraftInputSchema = z.object({
  reconciliationId: idSchema,
  ...cashReconciliationDraftFieldsSchema,
});
export type ReviseCashReconciliationDraftInput = z.infer<typeof reviseCashReconciliationDraftInputSchema>;

export const submitCashReconciliationInputSchema = z.object({
  reconciliationId: idSchema,
});
export type SubmitCashReconciliationInput = z.infer<typeof submitCashReconciliationInputSchema>;

export const approveCashReconciliationInputSchema = z.object({
  reconciliationId: idSchema,
});
export type ApproveCashReconciliationInput = z.infer<typeof approveCashReconciliationInputSchema>;

export const rejectCashReconciliationInputSchema = z.object({
  reconciliationId: idSchema,
  reason: requiredText(500, "Alasan penolakan wajib diisi."),
});
export type RejectCashReconciliationInput = z.infer<typeof rejectCashReconciliationInputSchema>;

export const requestCashReconciliationCorrectionInputSchema = z.object({
  reconciliationId: idSchema,
  reason: requiredText(500, "Alasan koreksi wajib diisi."),
});
export type RequestCashReconciliationCorrectionInput = z.infer<
  typeof requestCashReconciliationCorrectionInputSchema
>;

export const reopenCashPoolInputSchema = z.object({
  poolId: idSchema,
  reason: requiredText(500, "Alasan pembukaan kembali wajib diisi."),
});
export type ReopenCashPoolInput = z.infer<typeof reopenCashPoolInputSchema>;
