import type { Tone } from "@/components/ui/tone";
import type { ExecutiveAttentionTag } from "./types";

export const EXECUTIVE_ATTENTION_TAG_LABEL: Record<ExecutiveAttentionTag, string> = {
  UNBILLED: "Belum Ditagih",
  DRAFT_INCOMPLETE: "Draft Belum Lengkap",
  NOT_DELIVERED: "Belum Dikirim",
  DELIVERY_FAILED: "Pengiriman Gagal",
  NOT_ACKNOWLEDGED: "Belum Diterima",
};

export const EXECUTIVE_ATTENTION_TAG_TONE: Record<ExecutiveAttentionTag, Tone> = {
  UNBILLED: "danger",
  DRAFT_INCOMPLETE: "warning",
  NOT_DELIVERED: "warning",
  DELIVERY_FAILED: "danger",
  NOT_ACKNOWLEDGED: "info",
};
