import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";

// Matches expense_submission_revisions.amount (numeric(16,2), amount > 0):
// positive, at most 2 decimal places. Server-side coercion so both a raw
// number and a FormData string input are accepted.
const amountSchema = z.coerce
  .number({ message: "Nominal wajib diisi." })
  .positive("Nominal harus lebih besar dari nol.")
  .refine((value) => Math.abs(value - Math.round(value * 100) / 100) < 1e-6, "Maksimal 2 angka desimal.")
  .refine((value) => value < 1_000_000_000_000, "Nominal terlalu besar.");

const optionalIdSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  idSchema.optional(),
);

const expenseSubmissionFieldsSchema = {
  poolId: idSchema,
  projectId: idSchema,
  categoryId: idSchema,
  amount: amountSchema,
  description: requiredText(500, "Keterangan wajib diisi."),
  vendorId: optionalIdSchema,
  referenceNumber: optionalText(100),
};

export const createExpenseDraftInputSchema = z.object({
  tenantId: idSchema,
  ...expenseSubmissionFieldsSchema,
});
export type CreateExpenseDraftInput = z.infer<typeof createExpenseDraftInputSchema>;

export const reviseExpenseDraftInputSchema = z.object({
  submissionId: idSchema,
  ...expenseSubmissionFieldsSchema,
});
export type ReviseExpenseDraftInput = z.infer<typeof reviseExpenseDraftInputSchema>;

export const submitExpenseInputSchema = z.object({
  submissionId: idSchema,
});
export type SubmitExpenseInput = z.infer<typeof submitExpenseInputSchema>;

export const approveExpenseSubmissionInputSchema = z.object({
  submissionId: idSchema,
});
export type ApproveExpenseSubmissionInput = z.infer<typeof approveExpenseSubmissionInputSchema>;

export const rejectExpenseSubmissionInputSchema = z.object({
  submissionId: idSchema,
  reason: requiredText(500, "Alasan penolakan wajib diisi."),
});
export type RejectExpenseSubmissionInput = z.infer<typeof rejectExpenseSubmissionInputSchema>;

export const requestExpenseCorrectionInputSchema = z.object({
  submissionId: idSchema,
  reason: requiredText(500, "Alasan koreksi wajib diisi."),
});
export type RequestExpenseCorrectionInput = z.infer<typeof requestExpenseCorrectionInputSchema>;

export const cancelExpenseSubmissionInputSchema = z.object({
  submissionId: idSchema,
  reason: requiredText(500, "Alasan pembatalan wajib diisi."),
});
export type CancelExpenseSubmissionInput = z.infer<typeof cancelExpenseSubmissionInputSchema>;
