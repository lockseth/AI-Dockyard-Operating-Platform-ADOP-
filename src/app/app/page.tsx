import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { TEXT_TONE_CLASSES, type Tone } from "@/components/ui/tone";
import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { canReadCashImportStaging } from "@/lib/cash-import-staging/access";
import { canViewTrustedTransactionHistory } from "@/lib/transaction-history/access";
import { canAccessBillingWorkspace } from "@/lib/billing-workspace/access";
import { listBillingWorkspaceForActiveTenant } from "@/lib/billing-workspace/service";
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
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { listTrustedTransactionsForActiveTenant } from "@/lib/transaction-history/service";
import { formatBusinessDateLabel, formatRupiah, getJakartaBusinessDate } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import { getVesselProjectPriorityLabel } from "@/lib/vessel-projects/labels";
import {
  buildActiveProjectCostRows,
  buildOwnerControlSummary,
  buildUnbilledVesselIndicator,
  getExpenseSubmissionsPendingReview,
  getLatestReconciliationIdsByPool,
} from "@/lib/owner-control/view-model";
import { labelOrRaw, TRANSACTION_STATUS_LABEL, TRANSACTION_TYPE_LABEL } from "@/lib/transaction-history/labels";
import { formatSignedAmount } from "@/lib/transaction-history/present";

// Admin/Owner landing dashboard. Every read here is one of the existing
// *ForActiveTenant functions Owner Control and /app/reviews already call
// (plus listClientsForActiveTenant, the same master-data read the Clients
// page itself uses) — no new RPC or schema. Decision actions (approve/
// reject/commit/reopen/rollback) stay out of this page entirely; those
// remain Owner Control-only (see src/app/owner/control/page.tsx), reached
// here only via a read-only pending-count link.
const DAILY_CLOSE_STATUS_TONE: Record<string, Tone> = {
  open: "info",
  pending_close: "warning",
  closed: "success",
};

const PRIORITY_TONE: Record<string, Tone> = {
  emergency: "danger",
  urgent: "warning",
  standard: "neutral",
};

const TRANSACTION_STATUS_TONE: Record<string, Tone> = {
  active: "success",
  reversed: "danger",
  partially_reversed: "danger",
  reversal: "neutral",
};

const QUICK_ACTION_LINK_CLASS =
  "inline-flex h-10 items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-white px-[18px] text-sm font-semibold text-brand-navy transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

export default async function AppPage() {
  const context = await requireTenantContext();
  const businessDate = getJakartaBusinessDate(new Date());

  const canDailyOps = canAccessDailyOperations(context.roles);
  const canSeeImportBatches = canReadCashImportStaging(context.roles);
  const canViewHistory = canViewTrustedTransactionHistory(context.roles);
  const canSeeBilling = canAccessBillingWorkspace(context.roles);

  const pool = await getDailyCashPoolForActiveTenant(businessDate);

  const [
    summary,
    todayReconciliation,
    submissions,
    duplicateCandidates,
    reconciliations,
    projects,
    vessels,
    clients,
    costSummaries,
    importBatches,
    recentActivity,
    billingRows,
  ] = await Promise.all([
    pool ? getDailyCashPoolSummaryForActiveTenant(businessDate) : Promise.resolve(null),
    pool ? getCashPoolReconciliationForActiveTenant(pool.id) : Promise.resolve(null),
    listExpenseSubmissionsForActiveTenant(),
    listPendingExpenseDuplicateCandidatesForActiveTenant(),
    listCashPoolReconciliationsForActiveTenant(),
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listClientsForActiveTenant(),
    listVesselProjectCostSummaryForActiveTenant(),
    canSeeImportBatches ? listCashImportBatchesForActiveTenant() : Promise.resolve([]),
    canViewHistory
      ? listTrustedTransactionsForActiveTenant({ limit: 5 })
      : Promise.resolve({ transactions: [], nextCursor: null }),
    // Same read/role gate as /billing/workspace itself (owner/admin only) —
    // listBillingWorkspaceForActiveTenant() throws for any other role, so
    // it must stay behind canSeeBilling exactly like the other conditional
    // reads above.
    canSeeBilling ? listBillingWorkspaceForActiveTenant() : Promise.resolve([]),
  ]);

  const pendingSubmissions = getExpenseSubmissionsPendingReview(submissions);
  const latestReconciliationIds = getLatestReconciliationIdsByPool(reconciliations);
  const pendingEodReviewCount = reconciliations.filter(
    (row) => row.reconciliation_id && latestReconciliationIds.has(row.reconciliation_id) && row.status === "submitted",
  ).length;
  const pendingImportBatchCount = importBatches.filter(
    (batch) => batch.status === "mapping_required" || batch.status === "ready_for_review",
  ).length;
  const unbilledIndicator = buildUnbilledVesselIndicator(context.roles, billingRows);

  const activeProjectCostRows = buildActiveProjectCostRows(projects, vessels, costSummaries);
  const cashSummary = buildOwnerControlSummary({
    summary,
    pool,
    expensesPendingReviewCount: pendingSubmissions.length,
    duplicateCandidatesPendingCount: duplicateCandidates.length,
    todayReconciliation,
    activeProjectCount: activeProjectCostRows.length,
  });

  const clientNameById = new Map(clients.map((client) => [client.id, client.display_name]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  // Dashboard shows a bounded preview (highest cost first) — "Lihat Semua
  // Project" is the path to the full unbounded list on /app/vessel-projects.
  const DASHBOARD_PROJECT_PREVIEW_LIMIT = 5;
  const projectTableRows = activeProjectCostRows
    .map((row) => {
      const project = projectById.get(row.projectId);
      return {
        ...row,
        clientName: project ? (clientNameById.get(project.client_id) ?? "-") : "-",
        priority: project?.priority ?? "standard",
      };
    })
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, DASHBOARD_PROJECT_PREVIEW_LIMIT);

  const actionItems: Array<{ label: string; count: number; href: string; tone: Tone; valueLabel?: string }> = [
    {
      label: "Pengajuan Biaya Menunggu Review",
      count: pendingSubmissions.length,
      href: "/app/reviews",
      tone: "warning" as Tone,
    },
    {
      label: "Kandidat Duplikasi Menunggu Review",
      count: duplicateCandidates.length,
      href: "/app/reviews",
      tone: "danger" as Tone,
    },
    {
      label: "Rekonsiliasi EOD Menunggu Review",
      count: pendingEodReviewCount,
      href: "/app/reviews",
      tone: "info" as Tone,
    },
    ...(canSeeImportBatches
      ? [{ label: "Batch Import Perlu Review", count: pendingImportBatchCount, href: "/operations/import", tone: "neutral" as Tone }]
      : []),
    // unbilledIndicator is null for a role that cannot access the Billing
    // Workspace — same gate as /billing/workspace itself — so the item is
    // omitted entirely rather than shown with zeroed-out data.
    ...(unbilledIndicator
      ? [
          {
            label: "Kapal Belum Ditagihkan",
            count: unbilledIndicator.count,
            href: "/billing/workspace",
            tone: "danger" as Tone,
            valueLabel: formatRupiah(unbilledIndicator.amountTotal),
          },
        ]
      : []),
  ].filter((item) => item.count > 0);

  return (
    <AppShell title="Dashboard" sectionLabel="Ringkasan" operationalDateLabel={formatBusinessDateLabel(businessDate)} showMobileTitle={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Ringkasan operasional dan keuangan hari ini
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {formatBusinessDateLabel(businessDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/app"
              aria-label="Muat ulang data dashboard"
              title="Muat ulang data dashboard"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <RefreshIcon />
            </a>
            {canDailyOps ? (
              <Link href="/operations/daily">
                <Button variant="primary" size="md">
                  + Tambah Transaksi
                </Button>
              </Link>
            ) : null}
          </div>
        </section>

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard eyebrow="Saldo Awal" value={formatRupiah(cashSummary.openingCash)} />
              <StatCard eyebrow="Kas Masuk" value={formatRupiah(cashSummary.totalCashIn)} />
              <StatCard eyebrow="Kas Keluar" value={formatRupiah(cashSummary.totalCashOutApproved)} />
              <StatCard eyebrow="Saldo Akhir" value={formatRupiah(cashSummary.expectedClosingCash)} note="Terhitung sistem" />
            </div>
          ) : (
            <EmptyState
              text="Kas hari ini belum dibuka."
              action={canDailyOps ? { label: "Buka Operasional Harian", href: "/operations/daily" } : undefined}
            />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Perlu Tindakan</h2>
          {actionItems.length === 0 ? (
            <EmptyState text="Tidak ada pekerjaan tertunda saat ini." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {actionItems.map((item) => (
                <Link key={item.label} href={item.href} className="block">
                  <Card tone={item.tone} className="flex items-start gap-3 transition-colors hover:brightness-[0.98]">
                    <AlertIcon tone={item.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {item.label}
                      </span>
                      {item.valueLabel ? (
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
                          {item.valueLabel} belum ditagihkan
                        </span>
                      ) : null}
                    </span>
                    <Badge tone={item.tone}>{item.count}</Badge>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Project Kapal Aktif</h2>
            <Link href="/app/vessel-projects" className="text-xs font-semibold text-adop-accent-800 hover:underline dark:text-blue-300">
              Lihat Semua Project
            </Link>
          </div>
          {projectTableRows.length === 0 ? (
            <EmptyState text="Belum ada Project Kapal aktif." />
          ) : (
            <Table minWidth="560px">
              <TableHead>
                <TableRow>
                  <Th>Project Kapal</Th>
                  <Th align="right">Biaya Berjalan</Th>
                  <Th align="center">Prioritas</Th>
                </TableRow>
              </TableHead>
              <tbody>
                {projectTableRows.map((row) => (
                  <TableRow key={row.projectId}>
                    <Td>
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">{row.label}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.clientName}</p>
                    </Td>
                    <Td align="right">{formatRupiah(row.totalCost)}</Td>
                    <Td align="center">
                      <Badge tone={PRIORITY_TONE[row.priority] ?? "neutral"}>
                        {getVesselProjectPriorityLabel(row.priority)}
                      </Badge>
                    </Td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Pergerakan Kas 7 Hari</h2>
            <EmptyState text="Tren kas mingguan belum tersedia — memerlukan riwayat saldo harian lintas tanggal." />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Aktivitas Terbaru</h2>
            <EmptyState text="Log aktivitas belum tersedia." />
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Transaksi Terbaru</h2>
            {canViewHistory ? (
              <Link href="/operations/history" className="text-xs font-semibold text-adop-accent-800 hover:underline dark:text-blue-300">
                Lihat Semua Transaksi
              </Link>
            ) : null}
          </div>
          {!canViewHistory ? (
            <EmptyState text="Role Anda tidak memiliki akses ke riwayat transaksi." />
          ) : recentActivity.transactions.length === 0 ? (
            <EmptyState text="Belum ada transaksi." />
          ) : (
            <Table minWidth="820px">
              <TableHead>
                <TableRow>
                  <Th>Tanggal</Th>
                  <Th>Jenis</Th>
                  <Th>Project / Overhead</Th>
                  <Th>Deskripsi</Th>
                  <Th align="right">Efek Kas</Th>
                  <Th align="center">Status</Th>
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
                    <Td className="max-w-[220px] truncate" title={row.description ?? undefined}>
                      {row.description ?? "-"}
                    </Td>
                    <Td align="right">
                      <SignedAmount value={row.signed_cash_effect} />
                    </Td>
                    <Td align="center">
                      <Badge tone={row.status ? (TRANSACTION_STATUS_TONE[row.status] ?? "neutral") : "neutral"}>
                        {labelOrRaw(TRANSACTION_STATUS_LABEL, row.status)}
                      </Badge>
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

const ALERT_ICON_TONE_CLASSES: Record<Tone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-neutral-400 dark:text-neutral-500",
  info: "text-blue-600 dark:text-blue-400",
};

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon({ tone }: { tone: Tone }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`mt-0.5 shrink-0 ${ALERT_ICON_TONE_CLASSES[tone]}`}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 15.9v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
