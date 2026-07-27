import { z } from "zod";
import { idSchema, requiredText } from "@/lib/master-data/shared/validation";
import { EVIDENCE_ALLOWED_MIME_TYPES, EVIDENCE_MAX_SIZE_BYTES } from "./types";

export const createDraftInvoiceInputSchema = z.object({
  projectId: idSchema,
});
export type CreateDraftInvoiceInput = z.infer<typeof createDraftInvoiceInputSchema>;

export const bindInvoiceTransactionInputSchema = z.object({
  invoiceId: idSchema,
  transactionEntryId: idSchema,
});
export type BindInvoiceTransactionInput = z.infer<typeof bindInvoiceTransactionInputSchema>;

export const unbindInvoiceTransactionInputSchema = z.object({
  lineId: idSchema,
});
export type UnbindInvoiceTransactionInput = z.infer<typeof unbindInvoiceTransactionInputSchema>;

export const issueInvoiceInputSchema = z.object({
  invoiceId: idSchema,
});
export type IssueInvoiceInput = z.infer<typeof issueInvoiceInputSchema>;

export const voidInvoiceInputSchema = z.object({
  invoiceId: idSchema,
  reason: requiredText(500, "Alasan void wajib diisi."),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceInputSchema>;

export const reissueInvoiceInputSchema = z.object({
  predecessorInvoiceId: idSchema,
});
export type ReissueInvoiceInput = z.infer<typeof reissueInvoiceInputSchema>;

// storagePath is produced server-side-adjacent (the browser upload step
// writes it, using the tenant/invoice ids the server already gave it — see
// EvidenceUploadForm) never freely typed by the user; still validated here
// like any other input crossing the server-action boundary.
export const finalizeInvoiceEvidenceVersionInputSchema = z.object({
  invoiceId: idSchema,
  storagePath: z.string().trim().min(1, "Lokasi file wajib diisi."),
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/, "Hash file tidak valid."),
  sizeBytes: z.coerce
    .number({ message: "Ukuran file wajib diisi." })
    .int()
    .positive("Ukuran file harus lebih besar dari nol.")
    .max(EVIDENCE_MAX_SIZE_BYTES, "Ukuran file melebihi batas 50MB."),
  mimeType: z.enum(EVIDENCE_ALLOWED_MIME_TYPES, { message: "Format file tidak didukung." }),
});
export type FinalizeInvoiceEvidenceVersionInput = z.infer<typeof finalizeInvoiceEvidenceVersionInputSchema>;

export const verifyInvoiceEvidenceVersionInputSchema = z.object({
  versionId: idSchema,
});
export type VerifyInvoiceEvidenceVersionInput = z.infer<typeof verifyInvoiceEvidenceVersionInputSchema>;

export const rejectInvoiceEvidenceVersionInputSchema = z.object({
  versionId: idSchema,
  reason: requiredText(500, "Alasan penolakan wajib diisi."),
});
export type RejectInvoiceEvidenceVersionInput = z.infer<typeof rejectInvoiceEvidenceVersionInputSchema>;

export const getInvoiceEvidenceSignedUrlInputSchema = z.object({
  versionId: idSchema,
});
export type GetInvoiceEvidenceSignedUrlInput = z.infer<typeof getInvoiceEvidenceSignedUrlInputSchema>;
