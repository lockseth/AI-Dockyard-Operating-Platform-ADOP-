import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import type { Tone } from "@/components/ui/tone";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import type { ActiveProjectCostRow, OwnerControlSummary, UnbilledVesselIndicator } from "@/lib/owner-control/view-model";

// Same bounded-preview convention as /app's "Project Kapal Aktif" table
// (src/app/app/page.tsx) — highest-cost first, "Lihat Semua" points at the
// existing unbounded Project Kapal list rather than duplicating one here.
// This is a display-only slice; buildActiveProjectCostRows itself (and its
// alphabetical order, which other consumers rely on) is untouched.
const PROJECT_PREVIEW_LIMIT = 5;

// Same status->tone mapping /app's dashboard already uses for this exact
// field (src/app/app/page.tsx) — kept local rather than shared so each
// page's tone table stays self-contained and easy to audit.
const DAILY_CLOSE_STATUS_TONE: Record<string, Tone> = {
  open: "info",
  pending_close: "warning",
  closed: "success",
};

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
    <section id="ringkasan" className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50">Ringkasan Eksekutif</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={DAILY_CLOSE_STATUS_TONE[summary.dailyCloseStatus ?? ""] ?? "neutral"} dot>
            Kas: {getCashPoolDailyCloseStatusLabel(summary.dailyCloseStatus)}
          </Badge>
          <Badge tone={summary.eodReconciliationStatus ? "warning" : "neutral"}>
            EOD: {getCashReconciliationStatusLabel(summary.eodReconciliationStatus)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard eyebrow="Opening Cash" value={formatRupiah(summary.openingCash)} />
        <StatCard eyebrow="Total Cash-In" value={formatRupiah(summary.totalCashIn)} />
        <StatCard eyebrow="Total Cash-Out (Approved)" value={formatRupiah(summary.totalCashOutApproved)} />
        <StatCard eyebrow="Expected Closing Cash" value={formatRupiah(summary.expectedClosingCash)} note="Terhitung sistem" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          eyebrow="Pengeluaran Menunggu Review"
          value={String(summary.expensesPendingReviewCount)}
          note={
            summary.expensesPendingReviewCount > 0 ? (
              <Badge tone="warning" dot>
                Perlu review
              </Badge>
            ) : undefined
          }
        />
        <StatCard
          eyebrow="Kandidat Duplikasi Pending"
          value={String(summary.duplicateCandidatesPendingCount)}
          note={
            summary.duplicateCandidatesPendingCount > 0 ? (
              <Badge tone="warning" dot>
                Perlu review
              </Badge>
            ) : undefined
          }
        />
        <StatCard eyebrow="Project Kapal Aktif" value={String(summary.activeProjectCount)} />
      </div>

      {unbilledIndicator && unbilledIndicator.count > 0 ? (
        <Link href="/billing/workspace" className="block no-underline">
          <Card
            tone="danger"
            className="flex flex-wrap items-center gap-3 transition duration-200 hover:shadow-md hover:brightness-[0.98] motion-safe:hover:-translate-y-px"
          >
            <AttentionIcon />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Kapal Belum Ditagihkan</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {formatRupiah(unbilledIndicator.amountTotal)} belum ditagihkan — project closed tanpa invoice aktif
              </p>
            </div>
            <Badge tone="danger">{unbilledIndicator.count}</Badge>
          </Card>
        </Link>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-neutral-500">Biaya per Project Kapal Aktif</h3>
          <Link
            href="/app/vessel-projects"
            className="rounded text-xs font-semibold text-adop-accent-800 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:text-blue-300"
          >
            Lihat Semua Project
          </Link>
        </div>
        {activeProjectCostRows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">Belum ada Project Kapal aktif.</p>
        ) : (
          <>
            <div className="mt-2">
              <Table minWidth="360px">
                <TableHead>
                  <TableRow>
                    <Th>Project Kapal</Th>
                    <Th align="right">Biaya Berjalan</Th>
                  </TableRow>
                </TableHead>
                <tbody>
                  {[...activeProjectCostRows]
                    .sort((a, b) => b.totalCost - a.totalCost)
                    .slice(0, PROJECT_PREVIEW_LIMIT)
                    .map((row) => (
                      <TableRow key={row.projectId}>
                        <Td>{row.label}</Td>
                        <Td align="right" className="font-medium">
                          {formatRupiah(row.totalCost)}
                        </Td>
                      </TableRow>
                    ))}
                </tbody>
              </Table>
            </div>
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

function AttentionIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 15.9v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
