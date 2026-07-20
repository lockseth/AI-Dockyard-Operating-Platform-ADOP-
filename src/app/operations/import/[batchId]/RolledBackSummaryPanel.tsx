import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

// Shown once a batch reaches status = 'rolled_back' — every value here is
// the RPC's own rollback_* snapshot (Gate 1J-D), never recomputed
// client-side. No RollbackControl is ever rendered again once this is shown
// (the page only renders RollbackControl while status === 'committed') — a
// batch can never be rolled back twice.
export function RolledBackSummaryPanel({ batch }: { batch: CashImportBatchRow }) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-neutral-300 bg-neutral-100/60 p-4 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-fit rounded-full border border-neutral-400 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-700 dark:border-neutral-500 dark:text-neutral-300">
          Rolled Back
        </span>
        <h2 className="text-sm font-medium text-neutral-500">Batch Telah Dibatalkan (Rollback)</h2>
      </div>
      <p className="text-xs text-neutral-500">
        Dibatalkan oleh Owner pada{" "}
        {batch.rolled_back_at ? new Date(batch.rolled_back_at).toLocaleString("id-ID") : "-"}. Alasan:{" "}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">{batch.rollback_reason ?? "-"}</span>
      </p>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Row label="Jumlah Transaksi Pembalik" value={String(batch.rollback_reversal_count ?? 0)} />
        <Row label="Efek Kas Dibalik" value={formatRupiah(batch.rollback_reversed_cash_effect ?? 0)} />
        <Row label="Biaya Proyek Dibalik" value={formatRupiah(batch.rollback_reversed_project_cost ?? 0)} />
        <Row label="Overhead Bersama Dibalik" value={formatRupiah(batch.rollback_reversed_shared_overhead ?? 0)} />
        <Row label="Refund Proyek Dibalik" value={formatRupiah(batch.rollback_reversed_refund_effect ?? 0)} />
      </dl>
      <p className="text-xs text-neutral-500">
        Data asli (original) dan transaksi pembalik (reversal) tetap tersimpan pada ledger audit — tidak ada data yang
        dihapus.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white/60 px-3 py-2 dark:bg-neutral-950/40">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
