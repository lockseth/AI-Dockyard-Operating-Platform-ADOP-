import type { CommitBlocker } from "./canonical-preview";

export const BLOCKER_LABEL: Record<CommitBlocker, string> = {
  MAPPING_INCOMPLETE: "Masih ada label kapal yang belum dipetakan.",
  DISPOSITION_INCOMPLETE: "Masih ada baris yang belum memiliki keputusan (disposisi).",
  MANUAL_REVIEW_UNRESOLVED: "Masih ada baris berstatus 'Perlu Tinjauan Manual' yang belum diputuskan.",
  MAPPING_NOT_COMMITTABLE: "Ada baris dengan mapping unresolved — belum dapat dimasukkan ke data operasional.",
  CANDIDATE_PLAN_MISSING:
    "Ada label 'Kandidat Project Baru' yang belum dilengkapi rencana pembuatan (client/service type/tanggal mulai).",
  VALIDATION_ERRORS_PRESENT: "Masih ada baris berstatus error.",
  RECONCILIATION_VARIANCE: "Saldo penutup workbook belum rekonsiliasi dengan hasil hitung ulang.",
  OPENING_BALANCE_CONFLICT:
    "Kas harian tanggal ini sudah memiliki transaksi — saldo awal tidak dapat dimasukkan lagi (BLOCKED).",
};
