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

const entryScopeSchema = z.enum(["project", "shared_overhead"]).default("project");

const expenseSubmissionFieldsSchema = {
  poolId: idSchema,
  // Required only for entryScope "project" — enforced by the superRefine
  // below (and, authoritatively, by create_expense_draft/revise_expense_
  // draft's own check server-side), not by the schema type itself, since
  // a shared_overhead submission never carries a project.
  projectId: optionalIdSchema,
  categoryId: idSchema,
  amount: amountSchema,
  description: requiredText(500, "Keterangan wajib diisi."),
  vendorId: optionalIdSchema,
  referenceNumber: optionalText(100),
  entryScope: entryScopeSchema,
  facilityLocationId: optionalIdSchema,
};

function requireProjectForProjectScope(
  data: { entryScope: "project" | "shared_overhead"; projectId?: string },
  ctx: z.RefinementCtx,
) {
  if (data.entryScope === "project" && !data.projectId) {
    ctx.addIssue({ code: "custom", path: ["projectId"], message: "Project Kapal wajib diisi." });
  }
  if (data.entryScope === "shared_overhead" && data.projectId) {
    ctx.addIssue({ code: "custom", path: ["projectId"], message: "Biaya Bersama/Overhead tidak boleh memiliki Project Kapal." });
  }
}

export const createExpenseDraftInputSchema = z
  .object({
    tenantId: idSchema,
    ...expenseSubmissionFieldsSchema,
  })
  .superRefine(requireProjectForProjectScope);
export type CreateExpenseDraftInput = z.infer<typeof createExpenseDraftInputSchema>;

export const reviseExpenseDraftInputSchema = z
  .object({
    submissionId: idSchema,
    ...expenseSubmissionFieldsSchema,
  })
  .superRefine(requireProjectForProjectScope);
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
