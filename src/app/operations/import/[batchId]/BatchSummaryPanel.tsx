import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

const STATUS_LABEL: Record<CashImportBatchRow["status"], string> = {
  draft: "Draft",
  mapping_required: "Perlu Mapping",
  ready_for_review: "Siap Direview",
  superseded: "Digantikan",
  committed: "Disetujui & Dimasukkan",
  rolled_back: "Rolled Back",
};

export function BatchSummaryPanel({ batch }: { batch: CashImportBatchRow }) {
  const variance =
    batch.workbook_closing_balance === null ? null : batch.calculated_closing_balance - batch.workbook_closing_balance;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <h2 className="text-sm font-medium text-neutral-500">Identitas Batch</h2>
        <dl className="mt-2 grid gap-1 text-sm">
          <Row label="Nama File" value={batch.source_filename} />
          <Row label="SHA-256" value={batch.source_sha256} mono />
          <Row label="Sheet" value={batch.source_sheet_name} />
          <Row label="Tanggal Laporan" value={formatBusinessDateLabel(batch.business_date)} />
          <Row label="Status" value={STATUS_LABEL[batch.status]} />
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500">Rekonsiliasi</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Row label="Opening Balance" value={formatRupiah(batch.opening_balance)} />
          <Row label="Total Debit" value={formatRupiah(batch.total_debit)} />
          <Row label="Total Kredit" value={formatRupiah(batch.total_credit)} />
          <Row label="Closing (Hitung Ulang)" value={formatRupiah(batch.calculated_closing_balance)} />
          <Row
            label="Closing (Workbook)"
            value={batch.workbook_closing_balance === null ? "-" : formatRupiah(batch.workbook_closing_balance)}
          />
          <Row
            label="Variance"
            value={variance === null ? "-" : formatRupiah(variance)}
            emphasize={variance !== null && variance !== 0}
          />
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500">Klasifikasi Baris</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Row label="Transaksi" value={String(batch.transaction_count)} />
          <Row label="Warning" value={String(batch.warning_count)} />
          <Row label="Error" value={String(batch.error_count)} emphasize={batch.error_count > 0} />
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value, mono, emphasize }: { label: string; value: string; mono?: boolean; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd
        className={`${mono ? "font-mono text-xs break-all" : "font-medium"} ${
          emphasize ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
