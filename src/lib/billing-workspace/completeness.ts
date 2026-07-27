import type { InvoiceBillingSummaryRow, InvoiceTransactionLineRow } from "@/lib/invoice-evidence/types";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";

export type BillingCompletenessResult = "BELUM_LENGKAP" | "PERLU_DIPERIKSA" | "SIAP_DITAGIH";

export interface BillingCompletenessCheck {
  key: string;
  label: string;
  ok: boolean;
  // A failing blocking check forces BELUM_LENGKAP; a failing non-blocking
  // check only downgrades an otherwise-clean result to PERLU_DIPERIKSA.
  blocking: boolean;
  detail: string;
}

export interface BillingCompleteness {
  result: BillingCompletenessResult;
  checks: BillingCompletenessCheck[];
}

// Pure, deterministic presentation layer over already-computed facts —
// every input here is a row already loaded by the Billing Record detail
// page. This does NOT recompute `invoice_billing_summary.billing_completeness_status`
// (Contract §11, the database's own authoritative status already shown as
// the row/detail badge); it only explains, in plain language, which of the
// task's minimum checklist items pass or fail for Pak Hanafi. Client PIC/
// invoice-channel readiness is intentionally out of scope here — that is
// already covered by computeClientBillingReadiness on the Client detail
// page (src/lib/master-data/clients/billing-readiness.ts) and is not
// duplicated.
export function computeBillingRecordCompleteness(params: {
  project: VesselProjectRow;
  client: ClientRow | null;
  invoice: InvoiceBillingSummaryRow | null;
  lines: InvoiceTransactionLineRow[];
}): BillingCompleteness {
  const { project, client, invoice, lines } = params;
  const isLegacy = invoice?.origin === "legacy_import";
  const checks: BillingCompletenessCheck[] = [];

  checks.push({
    key: "project_status",
    label: "Proyek sudah pada status yang layak ditagihkan",
    ok: project.lifecycle_status === "closed",
    blocking: true,
    detail:
      project.lifecycle_status === "closed"
        ? "Project berstatus Ditutup."
        : `Project masih berstatus "${project.lifecycle_status}" — hanya project Ditutup yang bisa ditagihkan.`,
  });

  checks.push({
    key: "customer_identity",
    label: "Identitas customer dan informasi billing tersedia",
    ok: !!client && !!client.legal_name && !!client.address,
    blocking: true,
    detail: !client
      ? "Client tidak ditemukan."
      : !client.legal_name || !client.address
        ? "Nama legal dan/atau alamat billing client belum lengkap — lengkapi di Master Data > Clients."
        : "Nama legal dan alamat billing client tersedia.",
  });

  checks.push({
    key: "billing_record_exists",
    label: "Draft/invoice terkait ditemukan",
    ok: invoice !== null,
    blocking: true,
    detail: invoice
      ? `Billing Record ditemukan (status: ${invoice.status ?? "-"}).`
      : "Belum ada Billing Record (draft/invoice) untuk project ini.",
  });

  checks.push({
    key: "billing_metadata",
    label: "Billing metadata wajib lengkap",
    ok:
      !!invoice &&
      !!invoice.legal_entity_id &&
      !!invoice.client_id &&
      !!invoice.project_id &&
      !!invoice.invoice_number &&
      !!invoice.invoice_date &&
      (isLegacy || !!invoice.due_date),
    // Not blocking when there's no Billing Record yet — that gap is already
    // reported by billing_record_exists above, this check only applies once
    // a record exists. A legacy record's due_date may legitimately be
    // unknown (Contract §15.2) — non-blocking there too.
    blocking: invoice !== null && !isLegacy,
    detail: !invoice
      ? "Belum relevan — belum ada Billing Record."
      : invoice.legal_entity_id && invoice.client_id && invoice.project_id && invoice.invoice_number && invoice.invoice_date && (isLegacy || invoice.due_date)
        ? "Legal entity, nomor invoice, tanggal invoice, dan due date terisi."
        : isLegacy
          ? "Sebagian metadata legacy belum lengkap (due date boleh tidak diketahui untuk invoice lama)."
          : "Sebagian metadata (legal entity/nomor invoice/tanggal invoice/due date) belum terisi.",
  });

  const hasCoverage = lines.length > 0;
  checks.push({
    key: "coverage_recap",
    label: "Rekap pekerjaan dan biaya (cakupan transaksi) tersedia",
    ok: !invoice || hasCoverage,
    // Legacy invoices may have partial/unknown coverage that cannot be
    // fully reconstructed (Contract §15.7) — non-blocking there.
    blocking: invoice !== null && !isLegacy,
    detail: !invoice
      ? "Belum relevan — belum ada Billing Record."
      : hasCoverage
        ? `${lines.length} transaksi tercakup dalam rekap.`
        : isLegacy
          ? `Cakupan transaksi legacy: ${invoice.legacy_coverage_status ?? "unknown"} — tidak seluruhnya dapat direkonstruksi.`
          : "Belum ada transaksi yang dipilih untuk ditagihkan.",
  });

  const linesWithoutAmount = lines.filter((line) => line.amount === null || Number(line.amount) <= 0);
  checks.push({
    key: "line_amounts",
    label: "Tidak ada item billable tanpa nilai/harga",
    ok: linesWithoutAmount.length === 0,
    blocking: linesWithoutAmount.length > 0,
    detail:
      linesWithoutAmount.length === 0
        ? "Seluruh item tercakup memiliki nilai."
        : `${linesWithoutAmount.length} item tercakup tidak memiliki nilai yang valid.`,
  });

  checks.push({
    key: "evidence_verified",
    label: "Dokumen invoice final sudah terverifikasi (jika sudah diterbitkan)",
    ok: !invoice || invoice.status !== "issued" || invoice.is_final_document === true,
    blocking: false,
    detail: !invoice
      ? "Belum relevan — belum ada Billing Record."
      : invoice.status !== "issued"
        ? "Belum relevan — Billing Record belum diterbitkan."
        : invoice.is_final_document
          ? "Dokumen final sudah terverifikasi."
          : "Billing Record sudah diterbitkan tetapi dokumen final belum terverifikasi.",
  });

  const blockers = checks.filter((check) => check.blocking && !check.ok);
  const warnings = checks.filter((check) => !check.blocking && !check.ok);

  const result: BillingCompletenessResult =
    blockers.length > 0 ? "BELUM_LENGKAP" : warnings.length > 0 ? "PERLU_DIPERIKSA" : "SIAP_DITAGIH";

  return { result, checks };
}
