import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import type { ActiveProjectCostRow, OwnerControlSummary } from "@/lib/owner-control/view-model";

export function OwnerSummarySection({
  summary,
  activeProjectCostRows,
}: {
  summary: OwnerControlSummary;
  activeProjectCostRows: ActiveProjectCostRow[];
}) {
  return (
    <section id="ringkasan" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">1. Ringkasan Owner Control</h2>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Opening Cash" value={formatRupiah(summary.openingCash)} />
        <SummaryRow label="Total Cash-In" value={formatRupiah(summary.totalCashIn)} />
        <SummaryRow label="Total Cash-Out (Approved)" value={formatRupiah(summary.totalCashOutApproved)} />
        <SummaryRow label="Expected Closing Cash" value={formatRupiah(summary.expectedClosingCash)} />
        <SummaryRow label="Status Kas Hari Ini" value={getCashPoolDailyCloseStatusLabel(summary.dailyCloseStatus)} />
        <SummaryRow
          label="Status Rekonsiliasi Hari Ini"
          value={getCashReconciliationStatusLabel(summary.eodReconciliationStatus)}
        />
        <SummaryRow label="Pengeluaran Menunggu Review" value={String(summary.expensesPendingReviewCount)} />
        <SummaryRow label="Kandidat Duplikasi Pending" value={String(summary.duplicateCandidatesPendingCount)} />
        <SummaryRow label="Project Kapal Aktif" value={String(summary.activeProjectCount)} />
      </dl>

      <div className="mt-4">
        <h3 className="text-sm font-medium text-neutral-500">Biaya per Project Kapal Aktif</h3>
        {activeProjectCostRows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">Belum ada Project Kapal aktif.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {activeProjectCostRows.map((row) => (
              <li key={row.projectId} className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
                <span>{row.label}</span>
                <span className="font-medium">{formatRupiah(row.totalCost)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
