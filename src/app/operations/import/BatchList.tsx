import Link from "next/link";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

const STATUS_LABEL: Record<CashImportBatchRow["status"], string> = {
  draft: "Draft",
  mapping_required: "Perlu Mapping",
  ready_for_review: "Siap Direview",
  superseded: "Digantikan",
  committed: "Disetujui & Dimasukkan",
};

const STATUS_BADGE_CLASS: Record<CashImportBatchRow["status"], string> = {
  draft: "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  mapping_required: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ready_for_review: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  superseded: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-500",
  committed: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export function BatchList({ batches }: { batches: CashImportBatchRow[] }) {
  if (batches.length === 0) {
    return <p className="text-sm text-neutral-500">Belum ada batch import yang di-staging untuk tenant ini.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800">
            <th className="px-3 py-2">Tanggal Laporan</th>
            <th className="px-3 py-2">Nama File</th>
            <th className="px-3 py-2 text-right">Transaksi</th>
            <th className="px-3 py-2 text-right">Warning</th>
            <th className="px-3 py-2 text-right">Error</th>
            <th className="px-3 py-2 text-right">Variance</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Diunggah</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const variance =
              batch.workbook_closing_balance === null
                ? null
                : batch.calculated_closing_balance - batch.workbook_closing_balance;
            return (
              <tr key={batch.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
                <td className="px-3 py-2">
                  <Link href={`/operations/import/${batch.id}`} className="underline underline-offset-4">
                    {formatBusinessDateLabel(batch.business_date)}
                  </Link>
                </td>
                <td className="px-3 py-2">{batch.source_filename}</td>
                <td className="px-3 py-2 text-right">{batch.transaction_count}</td>
                <td className="px-3 py-2 text-right">{batch.warning_count}</td>
                <td className="px-3 py-2 text-right">{batch.error_count}</td>
                <td
                  className={`px-3 py-2 text-right ${variance !== null && variance !== 0 ? "text-red-600 dark:text-red-400" : ""}`}
                >
                  {variance === null ? "-" : formatRupiah(variance)}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[batch.status]}`}>
                    {STATUS_LABEL[batch.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">
                  {new Date(batch.created_at).toLocaleString("id-ID")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
