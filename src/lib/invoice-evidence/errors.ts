import type { PostgrestError } from "@supabase/supabase-js";

export const GENERIC_INVOICE_EVIDENCE_ERROR = "Gagal memproses invoice/dokumen evidence. Silakan coba lagi.";

// Never surface raw Postgres error text to the browser — same posture as
// mapCostLedgerError/mapVesselProjectError. `raise exception` messages from
// the Gate 4B/4C RPCs report under P0001; matched by fixed, internally-
// controlled substrings (never by user input).
export function mapInvoiceEvidenceError(error: PostgrestError | null | undefined): string {
  if (!error) {
    return GENERIC_INVOICE_EVIDENCE_ERROR;
  }

  switch (error.code) {
    case "23503":
      return "Invoice, transaksi, atau evidence tidak ditemukan atau bukan milik tenant Anda.";
    case "23505":
      return "Versi dokumen ini sudah pernah diunggah sebelumnya.";
    case "23514":
      return "Data tidak memenuhi aturan validasi (nominal, hash, atau ukuran file).";
    case "42501":
      return "Anda tidak memiliki izin untuk melakukan aksi ini.";
    case "P0001": {
      const message = error.message ?? "";
      if (message.includes("not authorized")) {
        return "Anda tidak memiliki izin untuk melakukan aksi ini pada invoice/dokumen evidence.";
      }
      if (message.includes("vessel project must be closed")) {
        return "Transaksi hanya dapat ditagihkan setelah Project Kapal-nya closed.";
      }
      if (message.includes("has been reversed")) {
        return "Transaksi ini sudah direversal dan tidak dapat ditagihkan.";
      }
      if (message.includes("already bound to an active invoice")) {
        return "Transaksi ini sudah terikat pada invoice aktif lain.";
      }
      if (message.includes("belongs to a different tenant")) {
        return "Transaksi ini bukan milik tenant Anda.";
      }
      if (message.includes("binding is locked")) {
        return "Binding transaksi terkunci — invoice ini sudah tidak berstatus draft.";
      }
      if (message.includes("at least one bound transaction")) {
        return "Invoice harus memiliki minimal satu transaksi terikat sebelum diterbitkan.";
      }
      if (message.includes("only a draft invoice can be issued")) {
        return "Hanya invoice berstatus draft yang dapat diterbitkan.";
      }
      if (message.includes("already void")) {
        return "Invoice ini sudah void sebelumnya.";
      }
      if (message.includes("void reason is required")) {
        return "Alasan void wajib diisi.";
      }
      if (message.includes("predecessor invoice must be void")) {
        return "Reissue hanya dapat dilakukan dari invoice yang sudah void.";
      }
      if (message.includes("already been reissued")) {
        return "Invoice void ini sudah pernah di-reissue sebelumnya.";
      }
      if (message.includes("evidence can only be uploaded for an issued invoice")) {
        return "Dokumen evidence hanya dapat diunggah untuk invoice yang sudah issued.";
      }
      if (message.includes("sha256 must be")) {
        return "Hash file tidak valid — silakan unggah ulang.";
      }
      if (message.includes("size_bytes must be")) {
        return "Ukuran file tidak sesuai batas yang diizinkan (maks. 50MB).";
      }
      if (message.includes("unsupported mime type")) {
        return "Format file tidak didukung — gunakan PDF, JPEG, atau PNG.";
      }
      if (message.includes("storage_path does not match")) {
        return "Lokasi file tidak valid untuk invoice ini.";
      }
      if (message.includes("storage object not found")) {
        return "File belum selesai diunggah ke storage — silakan coba lagi.";
      }
      if (message.includes("declared size_bytes does not match") || message.includes("declared mime_type does not match")) {
        return "Metadata file tidak konsisten dengan file yang diunggah — silakan unggah ulang.";
      }
      if (message.includes("only a pending evidence version can be verified")) {
        return "Versi dokumen ini sudah diverifikasi/ditolak sebelumnya.";
      }
      if (message.includes("only a pending evidence version can be rejected")) {
        return "Versi dokumen ini sudah diverifikasi/ditolak sebelumnya.";
      }
      if (message.includes("rejection reason is required")) {
        return "Alasan penolakan wajib diisi.";
      }
      if (message.includes("not found")) {
        return "Data tidak ditemukan.";
      }
      return GENERIC_INVOICE_EVIDENCE_ERROR;
    }
    default:
      return GENERIC_INVOICE_EVIDENCE_ERROR;
  }
}
