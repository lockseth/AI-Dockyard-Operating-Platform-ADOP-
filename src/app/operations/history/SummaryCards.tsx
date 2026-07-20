import { formatRupiah } from "@/lib/operations-daily/format";
import type { TrustedTransactionSummary } from "@/lib/transaction-history/repository";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: TrustedTransactionSummary | null }) {
  if (!summary) {
    return (
      <p className="text-xs text-neutral-500">
        Ringkasan tidak tersedia untuk filter saat ini — daftar transaksi di bawah tetap akurat.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Card label="Kas Masuk" value={formatRupiah(summary.total_cash_in)} />
      <Card label="Kas Keluar" value={formatRupiah(summary.total_cash_out)} />
      <Card
        label="Net Perubahan Kas"
        value={formatRupiah(summary.net_cash_effect)}
        hint={summary.net_cash_effect >= 0 ? "Bertambah" : "Berkurang"}
      />
      <Card
        label="Biaya Proyek Bersih"
        value={formatRupiah(summary.net_project_cost_effect)}
        hint={summary.net_project_cost_effect >= 0 ? "Bertambah" : "Berkurang"}
      />
      <Card label="Shared Overhead" value={formatRupiah(summary.total_shared_overhead)} />
    </div>
  );
}
