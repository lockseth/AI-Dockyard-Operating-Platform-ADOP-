import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText } from "@/lib/master-data/shared/validation";
import { vesselProjectPrioritySchema } from "@/lib/vessel-projects/validation";

export const idOrNullSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([idSchema, z.null()]),
);

export const vesselLabelSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([z.string().trim().max(200), z.null()]),
);

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid (YYYY-MM-DD).");

// Gate 6I-A: captured only when mappingKind is 'new_project_candidate' — a
// pure creation PLAN, never written to vessels/vessel_projects until
// approval. Facility is optional (mirrors createVesselProjectInputSchema);
// vessel name/client/service type/start date are required, matching
// set_cash_import_label_mapping's own CANDIDATE_PLAN_FIELDS_REQUIRED guard.
export const setCashImportLabelMappingInputSchema = z
  .object({
    batchId: idSchema,
    vesselLabel: vesselLabelSchema,
    mappingKind: z.enum(["cash", "existing_vessel_project", "new_project_candidate", "shared_overhead", "unresolved"]),
    mappedVesselProjectId: idOrNullSchema,
    candidateVesselName: z.preprocess(emptyToUndefined, optionalText(200)),
    candidateClientId: z.preprocess(emptyToUndefined, idSchema.optional()),
    candidateServiceTypeId: z.preprocess(emptyToUndefined, idSchema.optional()),
    candidateFacilityLocationId: z.preprocess(emptyToUndefined, idSchema.optional()),
    candidateStartDate: z.preprocess(emptyToUndefined, isoDateSchema.optional()),
    candidatePriority: z.preprocess(emptyToUndefined, vesselProjectPrioritySchema.optional()),
  })
  .refine((value) => value.mappingKind !== "existing_vessel_project" || value.mappedVesselProjectId !== null, {
    message: "Pilih Project Kapal untuk mapping existing_vessel_project.",
    path: ["mappedVesselProjectId"],
  })
  .refine(
    (value) =>
      value.mappingKind !== "new_project_candidate" ||
      (value.candidateVesselName && value.candidateClientId && value.candidateServiceTypeId && value.candidateStartDate),
    {
      message: "Lengkapi nama kapal, client, service type, dan tanggal mulai untuk kandidat project baru.",
      path: ["candidateVesselName"],
    },
  );
export type SetCashImportLabelMappingInput = z.infer<typeof setCashImportLabelMappingInputSchema>;

// scopeToLabel is the explicit discriminator between "whole batch" and "just
// this one label" — vesselLabel alone can't carry that distinction, since a
// legitimate label group is itself often null (rows the parser could not
// attach a label to).
export const autoApplyCashImportBatchDispositionsInputSchema = z.object({
  batchId: idSchema,
  vesselLabel: vesselLabelSchema.optional(),
  scopeToLabel: z.preprocess((value) => value === "true" || value === true, z.boolean()).optional(),
});
export type AutoApplyCashImportBatchDispositionsInput = z.infer<typeof autoApplyCashImportBatchDispositionsInputSchema>;

export const setCashImportRowDispositionInputSchema = z.object({
  rowId: idSchema,
  disposition: z.enum(["include", "skip", "manual_review"]),
  reason: z.preprocess(emptyToUndefined, optionalText(500)),
});
export type SetCashImportRowDispositionInput = z.infer<typeof setCashImportRowDispositionInputSchema>;

export const markCashImportBatchReadyForReviewInputSchema = z.object({
  batchId: idSchema,
});
export type MarkCashImportBatchReadyForReviewInput = z.infer<typeof markCashImportBatchReadyForReviewInputSchema>;

export const getCashImportBatchDetailInputSchema = z.object({
  batchId: idSchema,
});
export type GetCashImportBatchDetailInput = z.infer<typeof getCashImportBatchDetailInputSchema>;

export const approveAndCommitCashImportBatchInputSchema = z.object({
  batchId: idSchema,
});
export type ApproveAndCommitCashImportBatchInput = z.infer<typeof approveAndCommitCashImportBatchInputSchema>;

export const rejectCashImportBatchInputSchema = z.object({
  batchId: idSchema,
  reason: z.string().trim().min(1, "Alasan penolakan wajib diisi.").max(1000),
});
export type RejectCashImportBatchInput = z.infer<typeof rejectCashImportBatchInputSchema>;

export const rollbackCashImportBatchInputSchema = z.object({
  batchId: idSchema,
  reason: z.string().trim().min(1, "Alasan rollback wajib diisi.").max(1000),
});
export type RollbackCashImportBatchInput = z.infer<typeof rollbackCashImportBatchInputSchema>;
