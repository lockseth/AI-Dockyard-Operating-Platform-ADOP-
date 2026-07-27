import type { Tone } from "@/components/ui/tone";
import type { BillingCompletenessResult } from "./completeness";
import type { BillingWorkspaceStatus } from "./types";

export const BILLING_WORKSPACE_STATUS_LABEL: Record<BillingWorkspaceStatus, string> = {
  NOT_CLOSED: "Belum Ditutup",
  NO_INVOICE: "Belum Ditagih",
  DRAFT_INCOMPLETE: "Draft — Belum Lengkap",
  DRAFT_READY_TO_ISSUE: "Draft — Siap Diterbitkan",
  ISSUED_EVIDENCE_PENDING: "Diterbitkan — Menunggu Dokumen",
  READY_TO_SEND: "Siap Dikirim",
  VOID: "Void",
  LEGACY_RECORDED: "Tercatat (Legacy)",
};

export const BILLING_WORKSPACE_STATUS_TONE: Record<BillingWorkspaceStatus, Tone> = {
  NOT_CLOSED: "neutral",
  NO_INVOICE: "danger",
  DRAFT_INCOMPLETE: "warning",
  DRAFT_READY_TO_ISSUE: "info",
  ISSUED_EVIDENCE_PENDING: "warning",
  READY_TO_SEND: "success",
  VOID: "neutral",
  LEGACY_RECORDED: "neutral",
};

export const BILLING_COMPLETENESS_RESULT_LABEL: Record<BillingCompletenessResult, string> = {
  BELUM_LENGKAP: "Belum Lengkap",
  PERLU_DIPERIKSA: "Perlu Diperiksa",
  SIAP_DITAGIH: "Siap Ditagih",
};

export const BILLING_COMPLETENESS_RESULT_TONE: Record<BillingCompletenessResult, Tone> = {
  BELUM_LENGKAP: "danger",
  PERLU_DIPERIKSA: "warning",
  SIAP_DITAGIH: "success",
};
