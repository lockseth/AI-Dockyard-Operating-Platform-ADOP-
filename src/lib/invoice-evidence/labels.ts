import type { Tone } from "@/components/ui/tone";
import type { InvoiceEvidenceVersionStatus, InvoiceStatus } from "./types";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Diterbitkan",
  void: "Void",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  issued: "info",
  void: "danger",
};

export const EVIDENCE_VERSION_STATUS_LABEL: Record<InvoiceEvidenceVersionStatus, string> = {
  pending: "Menunggu Verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

export const EVIDENCE_VERSION_STATUS_TONE: Record<InvoiceEvidenceVersionStatus, Tone> = {
  pending: "warning",
  verified: "success",
  rejected: "danger",
};

export const EVIDENCE_DOCUMENT_STATUS_LABEL_NOT_UPLOADED = "Belum Diunggah";
export const EVIDENCE_DOCUMENT_STATUS_LABEL_FINAL = "Dokumen Final Sah";
