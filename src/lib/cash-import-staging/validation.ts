import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText } from "@/lib/master-data/shared/validation";

export const idOrNullSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([idSchema, z.null()]),
);

export const vesselLabelSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z.union([z.string().trim().max(200), z.null()]),
);

export const setCashImportLabelMappingInputSchema = z
  .object({
    batchId: idSchema,
    vesselLabel: vesselLabelSchema,
    mappingKind: z.enum(["cash", "existing_vessel_project", "new_project_candidate", "shared_overhead", "unresolved"]),
    mappedVesselProjectId: idOrNullSchema,
  })
  .refine((value) => value.mappingKind !== "existing_vessel_project" || value.mappedVesselProjectId !== null, {
    message: "Pilih Project Kapal untuk mapping existing_vessel_project.",
    path: ["mappedVesselProjectId"],
  });
export type SetCashImportLabelMappingInput = z.infer<typeof setCashImportLabelMappingInputSchema>;

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
