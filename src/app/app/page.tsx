import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { TEXT_TONE_CLASSES, type Tone } from "@/components/ui/tone";
import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { canReadCashImportStaging } from "@/lib/cash-import-staging/access";
import { canViewTrustedTransactionHistory } from "@/lib/transaction-history/access";
import { getDailyCashPoolForActiveTenant, getDailyCashPoolSummaryForActiveTenant } from "@/lib/cash-pool/service";
import {
  getCashPoolReconciliationForActiveTenant,
  listCashPoolReconciliationsForActiveTenant,
} from "@/lib/cash-reconciliation/service";
import { listExpenseSubmissionsForActiveTenant } from "@/lib/expense-approvals/service";
import { listPendingExpenseDuplicateCandidatesForActiveTenant } from "@/lib/expense-duplicate-detection/service";
import { listCashImportBatchesForActiveTenant } from "@/lib/cash-import-staging/service";
import { listVesselProjectCostSummaryForActiveTenant, listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listTrustedTransactionsForActiveTenant } from "@/lib/transaction-history/service";
import { formatBusinessDateLabel, formatRupiah, getJakartaBusinessDate } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import {
  buildActiveProjectCostRows,
  buildOwnerControlSummary,
  getExpenseSubmissionsPendingReview,
  getLatestReconciliationIdsByPool,
} from "@/lib/owner-control/view-model";
import { labelOrRaw, TRANSACTION_TYPE_LABEL } from "@/lib/transaction-history/labels";
import { formatSignedAmount } from "@/lib/transaction-history/present";

// Admin/Owner landing dashboard. Every read here is one of the existing
// *ForActiveTenant functions Owner Control and /app/reviews already call —
// no new query, RPC, or schema. Decision actions (approve/reject/commit/
// reopen/rollback) stay out of this page entirely; those remain Owner
// Control-only (see src/app/owner/control/page.tsx), reached here only via
// a read-only pending-count link.
const DAILY_CLOSE_STATUS_TONE: Record<string, Tone> = {
  open: "info",
  pending_close: "warning",
  closed: "success",
};

const QUICK_ACTION_LINK_CLASS =
  "inline-flex h-10 items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-white px-[18px] text-sm font-semibold text-brand-navy transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

export default async function AppPage() {
  const context = await requireTenantContext();
  const businessDate = getJakartaBusinessDate(new Date());

  const canDailyOps = canAccessDailyOperations(context.roles);
  const canSeeImportBatches = canReadCashImportStaging(context.roles);
  const canViewHistory = canViewTrustedTransactionHistory(context.roles);

  const pool = await getDailyCashPoolForActiveTenant(businessDate);

  const [
    summary,
    todayReconciliation,
    submissions,
    duplicateCandidates,
    reconciliations,
    projects,
    vessels,
    costSummaries,
    importBatches,
    recentActivity,
  ] = await Promise.all([
    pool ? getDailyCashPoolSummaryForActiveTenant(businessDate) : Promise.resolve(null),
    pool ? getCashPoolReconciliationForActiveTenant(pool.id) : Promise.resolve(null),
    listExpenseSubmissionsForActiveTenant(),
    listPendingExpenseDuplicateCandidatesForActiveTenant(),
    listCashPoolReconciliationsForActiveTenant(),
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listVesselProjectCostSummaryForActiveTenant(),
    canSeeImportBatches ? listCashImportBatchesForActiveTenant() : Promise.resolve([]),
    canViewHistory
      ? listTrustedTransactionsForActiveTenant({ limit: 5 })
      : Promise.resolve({ transactions: [], nextCursor: null }),
  ]);

  const pendingSubmissions = getExpenseSubmissionsPendingReview(submissions);
  const latestReconciliationIds = getLatestReconciliationIdsByPool(reconciliations);
  const pendingEodReviewCount = reconciliations.filter(
    (row) => row.reconciliation_id && latestReconciliationIds.has(row.reconciliation_id) && row.status === "submitted",
  ).length;
  const pendingImportBatchCount = importBatches.filter(
    (batch) => batch.status === "mapping_required" || batch.status === "ready_for_review",
  ).length;

  const activeProjectCostRows = buildActiveProjectCostRows(projects, vessels, costSummaries);
  const cashSummary = buildOwnerControlSummary({
    summary,
    pool,
    expensesPendingReviewCount: pendingSubmissions.length,
    duplicateCandidatesPendingCount: duplicateCandidates.length,
    todayReconciliation,
    activeProjectCount: activeProjectCostRows.length,
  });

  const runningCostTotal = activeProjectCostRows.reduce((total, row) => total + row.totalCost, 0);
  const mostRecentActiveProject = projects
    .filter((project) => project.lifecycle_status === "active")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
  const mostRecentActiveProjectLabel = mostRecentActiveProject
    ? (activeProjectCostRows.find((row) => row.projectId === mostRecentActiveProject.id)?.label ?? "-")
    : null;

  const actionItems = [
    { label: "Pengajuan Biaya Menunggu Review", count: pendingSubmissions.length, href: "/app/reviews" },
    { label: "Kandidat Duplikasi Menunggu Review", count: duplicateCandidates.length, href: "/app/reviews" },
    { label: "Rekonsiliasi EOD Menunggu Review", count: pendingEodReviewCount, href: "/app/reviews" },
    ...(canSeeImportBatches
      ? [{ label: "Batch Import Perlu Review", count: pendingImportBatchCount, href: "/operations/import" }]
      : []),
  ].filter((item) => item.count > 0);
  const totalPendingActions = actionItems.reduce((total, item) => total + item.count, 0);

  return (
    <AppShell title="Dashboard" operationalDateLabel={formatBusinessDateLabel(businessDate)}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-500">Status Kas Hari Ini</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={pool ? (DAILY_CLOSE_STATUS_TONE[cashSummary.dailyCloseStatus ?? ""] ?? "neutral") : "neutral"} dot>
                {getCashPoolDailyCloseStatusLabel(cashSummary.dailyCloseStatus)}
              </Badge>
              {todayReconciliation ? (
                <Badge tone="warning">EOD: {getCashReconciliationStatusLabel(todayReconciliation.status)}</Badge>
              ) : null}
            </div>
          </div>
          {pool ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard eyebrow="Saldo Awal" value={formatRupiah(cashSummary.openingCash)} />
              <StatCard eyebrow="Total Pengeluaran" value={formatRupiah(cashSummary.totalCashOutApproved)} />
              <StatCard eyebrow="Sisa Kas" value={formatRupiah(cashSummary.expectedClosingCash)} />
            </div>
          ) : (
            <EmptyState
              text="Kas hari ini belum dibuka."
              action={canDailyOps ? { label: "Buka Operasional Harian", href: "/operations/daily" } : undefined}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Ringkasan Project Kapal Aktif</h2>
          {activeProjectCostRows.length === 0 ? (
            <EmptyState text="Belum ada Project Kapal aktif." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard eyebrow="Project Aktif" value={activeProjectCostRows.length} />
              <StatCard eyebrow="Total Biaya Berjalan" value={formatRupiah(runningCostTotal)} />
              <StatCard eyebrow="Project Teraktif" value={mostRecentActiveProjectLabel ?? "-"} />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Pekerjaan yang Memerlukan Tindakan</h2>
          {totalPendingActions === 0 ? (
            <EmptyState text="Tidak ada pekerjaan tertunda saat ini." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {actionItems.map((item) => (
                <Link key={item.label} href={item.href} className="block">
                  <Card className="flex items-center justify-between gap-3 transition-colors hover:border-neutral-300 dark:hover:border-neutral-700">
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{item.label}</span>
                    <Badge tone="warning">{item.count}</Badge>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-500">Aktivitas/Transaksi Terbaru</h2>
            {canViewHistory ? (
              <Link
                href="/operations/history"
                className="text-xs font-medium text-blue-800 underline underline-offset-4 dark:text-blue-300"
              >
                Lihat Semua
              </Link>
            ) : null}
          </div>
          {!canViewHistory ? (
            <EmptyState text="Role Anda tidak memiliki akses ke riwayat transaksi." />
          ) : recentActivity.transactions.length === 0 ? (
            <EmptyState text="Belum ada transaksi." />
          ) : (
            <Table minWidth="640px">
              <TableHead>
                <TableRow>
                  <Th>Tanggal</Th>
                  <Th>Jenis</Th>
                  <Th>Project / Overhead</Th>
                  <Th align="right">Efek Kas</Th>
                </TableRow>
              </TableHead>
              <tbody>
                {recentActivity.transactions.map((row) => (
                  <TableRow key={row.logical_transaction_id}>
                    <Td>{row.business_date ? formatBusinessDateLabel(row.business_date) : "-"}</Td>
                    <Td>{labelOrRaw(TRANSACTION_TYPE_LABEL, row.transaction_type)}</Td>
                    <Td>
                      {row.vessel_name
                        ? `${row.vessel_name}${row.project_code ? ` (${row.project_code})` : ""}`
                        : "Shared Overhead"}
                    </Td>
                    <Td align="right">
                      <SignedAmount value={row.signed_cash_effect} />
                    </Td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Aksi Cepat</h2>
          <div className="flex flex-wrap gap-3">
            {canDailyOps ? (
              <Link href="/operations/daily" className={QUICK_ACTION_LINK_CLASS}>
                Operasional Harian
              </Link>
            ) : null}
            {canViewHistory ? (
              <Link href="/operations/history" className={QUICK_ACTION_LINK_CLASS}>
                Riwayat Transaksi
              </Link>
            ) : null}
            <Link href="/app/vessel-projects" className={QUICK_ACTION_LINK_CLASS}>
              Project Kapal
            </Link>
            {canSeeImportBatches ? (
              <Link href="/operations/import" className={QUICK_ACTION_LINK_CLASS}>
                Import Data
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SignedAmount({ value }: { value: number | null }) {
  const presentation = formatSignedAmount(value);
  const tone: Tone = presentation.isZero ? "neutral" : presentation.isPositive ? "success" : "danger";
  return <span className={`tabular-nums ${TEXT_TONE_CLASSES[tone]}`}>{presentation.text}</span>;
}

function EmptyState({ text, action }: { text: string; action?: { label: string; href: string } }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{text}</span>
      {action ? (
        <Link href={action.href} className={QUICK_ACTION_LINK_CLASS}>
          {action.label}
        </Link>
      ) : null}
    </Card>
  );
}
