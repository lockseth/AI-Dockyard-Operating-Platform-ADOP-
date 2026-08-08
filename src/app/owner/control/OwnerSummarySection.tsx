import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Tone } from "@/components/ui/tone";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import type { ActiveProjectCostRow, OwnerControlSummary, UnbilledVesselIndicator } from "@/lib/owner-control/view-model";
import { SectionIconChip } from "./SectionIcon";

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

const HOVER_LIFT_CLASSES =
  "transition duration-200 motion-reduce:transition-none hover:shadow hover:brightness-[0.98] motion-safe:hover:-translate-y-px";

export function OwnerSummarySection({
  summary,
  activeProjectCostRows,
  unbilledIndicator,
}: {
  summary: OwnerControlSummary;
  activeProjectCostRows: ActiveProjectCostRow[];
  unbilledIndicator: UnbilledVesselIndicator | null;
}) {
  const sortedProjectRows = [...activeProjectCostRows].sort((a, b) => b.totalCost - a.totalCost).slice(0, PROJECT_PREVIEW_LIMIT);

  return (
    <section id="ringkasan" className="flex flex-col gap-4">
      {/* Posisi Kas — the four existing cash metrics as one compact card
          (mini-stat grid) instead of four equal-weight cards, so an all-Rp0
          early-morning state doesn't dominate the page (Founder UAT R1). */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="text-xs font-bold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            Posisi Kas
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="md" tone={DAILY_CLOSE_STATUS_TONE[summary.dailyCloseStatus ?? ""] ?? "neutral"} dot>
              Kas: {getCashPoolDailyCloseStatusLabel(summary.dailyCloseStatus)}
            </Badge>
            <Badge size="md" tone={summary.eodReconciliationStatus ? "warning" : "neutral"}>
              EOD: {getCashReconciliationStatusLabel(summary.eodReconciliationStatus)}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MiniStat label="Opening Cash" value={formatRupiah(summary.openingCash)} />
          <MiniStat label="Total Cash-In" value={formatRupiah(summary.totalCashIn)} />
          <MiniStat label="Total Cash-Out (Approved)" value={formatRupiah(summary.totalCashOutApproved)} />
          <MiniStat label="Expected Closing Cash" value={formatRupiah(summary.expectedClosingCash)} note="Terhitung sistem" />
        </div>
      </Card>

      {/* Owner action indicators — separate from Posisi Kas since these are
          things to act on, not a balance to read. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <IndicatorTile
          href="#tinjauan-biaya"
          icon="expense"
          tone={summary.expensesPendingReviewCount > 0 ? "warning" : "neutral"}
          value={summary.expensesPendingReviewCount}
          label="Pengeluaran Menunggu Review"
          showBadge={summary.expensesPendingReviewCount > 0}
        />
        <IndicatorTile
          href="#tinjauan-duplikasi"
          icon="duplicate"
          tone={summary.duplicateCandidatesPendingCount > 0 ? "danger" : "neutral"}
          value={summary.duplicateCandidatesPendingCount}
          label="Kandidat Duplikasi Pending"
          showBadge={summary.duplicateCandidatesPendingCount > 0}
        />
        <IndicatorTile
          href="/app/vessel-projects"
          icon="vessel"
          tone="info"
          value={summary.activeProjectCount}
          label="Project Kapal Aktif"
        />
      </div>

      {/* Attention card — the one surface that's allowed to stand out. Taller
          than the tiles above, count + nominal as the two focal points,
          soft amber (not full-bleed red) so it reads as "needs attention"
          rather than "system error". */}
      {unbilledIndicator && unbilledIndicator.count > 0 ? (
        <Link href="/billing/workspace" className="block no-underline">
          <Card tone="warning" className={`relative flex items-center gap-4 overflow-hidden ${HOVER_LIFT_CLASSES}`}>
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-amber-500 dark:bg-amber-400" />
            <SectionIconChip kind="billing" tone="warning" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                Perlu Tindakan Billing
              </p>
              <p className="mt-0.5 text-base font-bold text-neutral-900 dark:text-neutral-50">Kapal Belum Ditagihkan</p>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                {formatRupiah(unbilledIndicator.amountTotal)} belum ditagihkan — project closed tanpa invoice aktif
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-2xl font-extrabold text-amber-700 tabular-nums dark:text-amber-300">
                {unbilledIndicator.count}
              </span>
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">kapal</span>
            </div>
          </Card>
        </Link>
      ) : null}

      {/* Project watchlist — semantic list rows instead of an administrative
          table (Founder UAT R1: "masih seperti tabel administratif"). */}
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
            <div className="mt-2 overflow-hidden rounded-xl border border-neutral-200 shadow-sm dark:border-neutral-800">
              <ul role="list" className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
                {sortedProjectRows.map((row) => (
                  <li key={row.projectId}>
                    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <SectionIconChip kind="vessel" tone="info" size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {row.label}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-neutral-900 tabular-nums dark:text-neutral-50">
                        {formatRupiah(row.totalCost)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
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

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-900/60">
      <p className="truncate text-[10.5px] font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-neutral-900 tabular-nums dark:text-neutral-50">{value}</p>
      {note ? <p className="mt-0.5 text-[10.5px] text-neutral-400 dark:text-neutral-500">{note}</p> : null}
    </div>
  );
}

function IndicatorTile({
  href,
  icon,
  tone,
  value,
  label,
  showBadge = false,
}: {
  href: string;
  icon: "expense" | "duplicate" | "vessel";
  tone: Tone;
  value: number;
  label: string;
  showBadge?: boolean;
}) {
  return (
    <Link href={href} className="block no-underline">
      <Card className={`flex items-start gap-3 ${HOVER_LIFT_CLASSES}`}>
        <SectionIconChip kind={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-extrabold text-neutral-900 tabular-nums dark:text-neutral-50">{value}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
          {showBadge ? (
            <Badge tone="warning" dot className="mt-1.5">
              Perlu review
            </Badge>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}
