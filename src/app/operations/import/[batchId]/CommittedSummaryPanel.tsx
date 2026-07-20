import Link from "next/link";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

// Shown once a batch reaches status = 'committed' — the RPC's own
// canonical_* snapshot columns, never recomputed client-side. No approve
// control is ever rendered again once this is shown (the page only renders
// OwnerApprovalControl while status === 'ready_for_review').
export function CommittedSummaryPanel({ batch }: { batch: CashImportBatchRow }) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <div>
        <h2 className="text-sm font-medium text-neutral-500">Batch Telah Disetujui &amp; Dimasukkan</h2>
        <p className="text-xs text-neutral-500">
          Disetujui oleh Owner pada {batch.committed_at ? new Date(batch.committed_at).toLocaleString("id-ID") : "-"}.
          Staging tidak dapat diubah lagi. Rollback belum tersedia pada gate ini.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Row label="Saldo Awal (Opening)" value={formatRupiah(batch.canonical_opening_cash ?? 0)} />
        <Row label="Cash Top-Up" value={formatRupiah(batch.canonical_cash_top_up_total ?? 0)} />
        <Row label="Project Refund" value={formatRupiah(batch.canonical_project_refund_total ?? 0)} />
        <Row label="Project Expense" value={formatRupiah(batch.canonical_project_expense_total ?? 0)} />
        <Row label="Shared Overhead" value={formatRupiah(batch.canonical_shared_overhead_total ?? 0)} />
        <Row
          label="Net Project Cost"
          value={formatRupiah((batch.canonical_project_expense_total ?? 0) - (batch.canonical_project_refund_total ?? 0))}
        />
        <Row label="Canonical Closing Cash" value={formatRupiah(batch.canonical_closing_cash ?? 0)} emphasize />
      </dl>

      <div className="flex gap-4 text-xs">
        <Link href="/operations/daily" className="underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200">
          Lihat Operasional Harian
        </Link>
        <Link href="/owner/control" className="underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200">
          Lihat Owner Control
        </Link>
      </div>
    </section>
  );
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white/60 px-3 py-2 dark:bg-neutral-950/40">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${emphasize ? "text-blue-700 dark:text-blue-300" : ""}`}>{value}</dd>
    </div>
  );
}
