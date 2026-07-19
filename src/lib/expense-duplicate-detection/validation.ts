import { z } from "zod";
import { idSchema, requiredText } from "@/lib/master-data/shared/validation";

export const listExpenseDuplicateCandidatesForSubmissionInputSchema = z.object({
  submissionId: idSchema,
});
export type ListExpenseDuplicateCandidatesForSubmissionInput = z.infer<
  typeof listExpenseDuplicateCandidatesForSubmissionInputSchema
>;

export const resolveExpenseDuplicateCandidateInputSchema = z.object({
  candidateId: idSchema,
  resolution: z.enum(["not_duplicate", "confirmed_duplicate"]),
  reason: requiredText(500, "Alasan resolusi kandidat duplikasi wajib diisi."),
});
export type ResolveExpenseDuplicateCandidateInput = z.infer<typeof resolveExpenseDuplicateCandidateInputSchema>;
