import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/operations-daily/format";

// Every figure here is derived straight from data the page already loads
// for the table/sections above — no new query, no invented metric. A stat
// with no honest source (e.g. attachment/evidence completeness — not a
// tracked field anywhere in this codebase) is left out rather than faked.
export function DailySummaryPanel({
  transactionCount,
  pendingReviewCount,
  duplicateCandidateCount,
  largestExpense,
}: {
  transactionCount: number;
  pendingReviewCount: number;
  duplicateCandidateCount: number;
  largestExpense: { label: string; amount: number } | null;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Ringkasan Hari Ini</h2>
        <Link
          href="/operations/history"
          className="text-xs font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Buka Riwayat Transaksi &rarr;
        </Link>
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        <SummaryRow label="Transaksi tercatat" value={transactionCount} />
        <SummaryRow label="Menunggu review" value={pendingReviewCount} />
        <SummaryRow label="Potensi duplikat" value={duplicateCandidateCount} />
      </dl>

      {largestExpense ? (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Pengeluaran terbesar</p>
          <p className="mt-1 text-sm font-bold">{largestExpense.label}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatRupiah(largestExpense.amount)} pengeluaran</p>
        </div>
      ) : null}
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}
