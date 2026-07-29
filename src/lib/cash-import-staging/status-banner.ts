import type { CashImportBatchRow } from "./repository";

export type CashImportBatchBannerTone = "warning" | "informational" | "success" | "neutral";

export interface CashImportBatchStatusBanner {
  message: string;
  tone: CashImportBatchBannerTone;
}

const BANNER_BY_STATUS: Record<CashImportBatchRow["status"], CashImportBatchStatusBanner> = {
  draft: {
    message: "STAGING — BELUM MASUK KE KAS DAN BIAYA OPERASIONAL",
    tone: "warning",
  },
  mapping_required: {
    message: "STAGING — BELUM MASUK KE KAS DAN BIAYA OPERASIONAL",
    tone: "warning",
  },
  ready_for_review: {
    message: "MENUNGGU PERSETUJUAN — BELUM MASUK KE DATA OPERASIONAL",
    tone: "informational",
  },
  committed: {
    message: "DISETUJUI & DIMASUKKAN — DATA SUDAH MASUK KE OPERASIONAL",
    tone: "success",
  },
  rolled_back: {
    message: "DIBATALKAN (ROLLBACK) — TRANSAKSI PEMBALIK TELAH MASUK KE OPERASIONAL, DATA ASLI TIDAK LAGI AKTIF",
    tone: "neutral",
  },
  superseded: {
    message: "DIGANTIKAN — BATCH INI TIDAK DIGUNAKAN",
    tone: "neutral",
  },
};

// Single canonical derivation so every surface (banner, badge, explanatory
// text) agrees on what a batch status means — no per-page string patching.
export function getCashImportBatchStatusBanner(status: CashImportBatchRow["status"]): CashImportBatchStatusBanner {
  return BANNER_BY_STATUS[status];
}
