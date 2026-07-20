import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportAnalysis } from "@/lib/cash-import/types";

export function SummaryPanel({ analysis }: { analysis: CashImportAnalysis }) {
  const { identity, summary } = analysis;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <h2 className="text-sm font-medium text-neutral-500">Identitas File</h2>
        <dl className="mt-2 grid gap-1 text-sm">
          <Row label="Nama File" value={identity.fileName} />
          <Row label="Ukuran" value={`${identity.fileSizeBytes.toLocaleString("id-ID")} bytes`} />
          <Row label="SHA-256" value={identity.fileSha256} mono />
          <Row label="Sheet Ditemukan" value={identity.sheetNames.join(", ")} />
          <Row label="Sheet Digunakan" value={identity.sheetUsed} />
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500">Ringkasan</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Row label="Opening Balance" value={formatRupiah(summary.openingBalance)} />
          <Row label="Total Debit" value={formatRupiah(summary.totalDebit)} />
          <Row label="Total Kredit" value={formatRupiah(summary.totalCredit)} />
          <Row label="Closing (Hitung Ulang)" value={formatRupiah(summary.calculatedClosingBalance)} />
          <Row
            label="Closing (Workbook)"
            value={summary.workbookReportedClosingBalance === null ? "-" : formatRupiah(summary.workbookReportedClosingBalance)}
          />
          <Row
            label="Variance"
            value={summary.closingVariance === null ? "-" : formatRupiah(summary.closingVariance)}
            emphasize={summary.closingVariance !== null && summary.closingVariance !== 0}
          />
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500">Klasifikasi Baris</h2>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Row label="Valid" value={String(summary.validRowCount)} />
          <Row label="Warning" value={String(summary.warningRowCount)} />
          <Row label="Error" value={String(summary.errorRowCount)} />
          <Row label="Manual Mapping Required" value={String(summary.manualMappingRequiredCount)} />
          <Row label="Row Kosong Diabaikan" value={String(summary.ignoredBlankRowCount)} />
          <Row label="Total Row Terdeteksi" value={summary.totalRowDetected ? `Ya (baris ${summary.totalRowNumber})` : "Tidak"} />
        </dl>
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-500">Kapal / Kategori Ditemukan ({summary.uniqueVesselLabels.length})</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.uniqueVesselLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs dark:border-neutral-800"
            >
              {label}
            </span>
          ))}
        </div>
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
