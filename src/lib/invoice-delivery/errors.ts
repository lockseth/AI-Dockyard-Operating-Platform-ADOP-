import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_INVOICE_DELIVERY_ERROR = "Gagal mencatat pengiriman/penerimaan invoice. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser — same posture as
// mapInvoiceEvidenceError. `raise exception` messages from
// record_invoice_delivery_event report under P0001; matched by fixed,
// internally-controlled substrings (never by user input).
export function mapInvoiceDeliveryError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_INVOICE_DELIVERY_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Invoice tidak ditemukan atau bukan milik tenant Anda.";
    case "23514":
      return "Data tidak memenuhi aturan validasi pencatatan pengiriman.";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("not authorized")) {
        return "Anda tidak memiliki izin untuk mencatat pengiriman/penerimaan invoice ini.";
      }
      if (message.includes("invoice must be issued")) {
        return "Pengiriman hanya dapat dicatat untuk invoice yang sudah diterbitkan (issued).";
      }
      if (message.includes("recipient snapshot is required")) {
        return "Penerima wajib diisi.";
      }
      if (message.includes("failure reason is required")) {
        return "Alasan gagal wajib diisi untuk status gagal.";
      }
      if (message.includes("failure reason is only allowed")) {
        return "Alasan gagal hanya berlaku untuk status gagal.";
      }
      if (message.includes("acknowledgment note is only allowed")) {
        return "Catatan penerimaan hanya berlaku untuk status diterima.";
      }
      if (message.includes("already acknowledged")) {
        return "Invoice ini sudah tercatat diterima — tidak ada aksi lanjutan yang dapat dicatat.";
      }
      if (message.includes("acknowledgment requires a prior sent or delivered event")) {
        return "Catat pengiriman terlebih dahulu sebelum mencatat penerimaan.";
      }
      if (message.includes("delivered requires a prior sent event")) {
        return "Catat status terkirim (sent) terlebih dahulu sebelum mencatat status delivered.";
      }
      if (message.includes("invoice not found")) {
        return "Invoice tidak ditemukan.";
      }
      return GENERIC_INVOICE_DELIVERY_ERROR;
    }
    default:
      return GENERIC_INVOICE_DELIVERY_ERROR;
  }
}
