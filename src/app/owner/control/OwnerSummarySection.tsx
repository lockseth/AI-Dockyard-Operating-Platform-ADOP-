import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import type { ActiveProjectCostRow, OwnerControlSummary, UnbilledVesselIndicator } from "@/lib/owner-control/view-model";

// Same bounded-preview convention as /app's "Project Kapal Aktif" table
// (src/app/app/page.tsx) — highest-cost first, "Lihat Semua" points at the
// existing unbounded Project Kapal list rather than duplicating one here.
// This is a display-only slice; buildActiveProjectCostRows itself (and its
// alphabetical order, which other consumers rely on) is untouched.
const PROJECT_PREVIEW_LIMIT = 5;

export function OwnerSummarySection({
  summary,
  activeProjectCostRows,
  unbilledIndicator,
}: {
  summary: OwnerControlSummary;
  activeProjectCostRows: ActiveProjectCostRow[];
  unbilledIndicator: UnbilledVesselIndicator | null;
}) {
  return (
    <section id="ringkasan" className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">1. Ringkasan Owner Control</h2>

      <dl className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
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

      {unbilledIndicator && unbilledIndicator.count > 0 ? (
        <Link href="/billing/workspace" className="mt-4 block no-underline">
          <Card
            tone="danger"
            className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:brightness-[0.98]"
          >
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Kapal Belum Ditagihkan</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {formatRupiah(unbilledIndicator.amountTotal)} belum ditagihkan — project closed tanpa invoice aktif
              </p>
            </div>
            <Badge tone="danger">{unbilledIndicator.count}</Badge>
          </Card>
        </Link>
      ) : null}

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-neutral-500">Biaya per Project Kapal Aktif</h3>
          <Link
            href="/app/vessel-projects"
            className="text-xs font-semibold text-adop-accent-800 hover:underline dark:text-blue-300"
          >
            Lihat Semua Project
          </Link>
        </div>
        {activeProjectCostRows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">Belum ada Project Kapal aktif.</p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {[...activeProjectCostRows]
                .sort((a, b) => b.totalCost - a.totalCost)
                .slice(0, PROJECT_PREVIEW_LIMIT)
                .map((row) => (
                  <li
                    key={row.projectId}
                    className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900"
                  >
                    <span>{row.label}</span>
                    <span className="font-medium">{formatRupiah(row.totalCost)}</span>
                  </li>
                ))}
            </ul>
            {activeProjectCostRows.length > PROJECT_PREVIEW_LIMIT ? (
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Menampilkan {Math.min(PROJECT_PREVIEW_LIMIT, activeProjectCostRows.length)} dari{" "}
                {activeProjectCostRows.length} Project Kapal aktif (biaya tertinggi lebih dulu).
              </p>
            ) : null}
          </>
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
