import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { canReadCashImportStaging } from "@/lib/cash-import-staging/access";
import { listCashImportBatchesForActiveTenant } from "@/lib/cash-import-staging/service";
import { listExpenseSubmissionsForActiveTenant } from "@/lib/expense-approvals/service";
import { listPendingExpenseDuplicateCandidatesForActiveTenant } from "@/lib/expense-duplicate-detection/service";
import { listCashPoolsForActiveTenant } from "@/lib/cash-pool/service";
import { listCashPoolReconciliationsForActiveTenant } from "@/lib/cash-reconciliation/service";
import {
  buildCashPoolBusinessDateMap,
  getExpenseSubmissionsPendingReview,
  getLatestReconciliationIdsByPool,
} from "@/lib/owner-control/view-model";
import { buildVesselProjectLabelMap } from "@/lib/operations-daily/view-model";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getExpenseSubmissionStatusLabel, getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import { getExpenseDuplicateReasonLabel } from "@/lib/owner-control/labels";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { BatchList } from "@/app/operations/import/BatchList";
import { AppShell } from "@/components/shell/AppShell";

// Read-only monitoring inbox — reuses the exact same *ForActiveTenant read
// functions Owner Control already calls; no new RPC or approval action is
// introduced here. Owner sees a link into Owner Control for the actual
// approve/reject/rollback decision; admin/reviewer/viewer only ever see
// status.
export default async function ReviewsPage() {
  const context = await requireTenantContext();
  const canApprove = context.roles.includes("owner");
  const canSeeImportBatches = canReadCashImportStaging(context.roles);

  const [submissions, duplicateCandidates, reconciliations, pools, projects, vessels, importBatches] =
    await Promise.all([
      listExpenseSubmissionsForActiveTenant(),
      listPendingExpenseDuplicateCandidatesForActiveTenant(),
      listCashPoolReconciliationsForActiveTenant(),
      listCashPoolsForActiveTenant(),
      listVesselProjectsForActiveTenant(),
      listVesselsForActiveTenant(),
      canSeeImportBatches ? listCashImportBatchesForActiveTenant() : Promise.resolve([]),
    ]);

  const businessDateByPoolId = buildCashPoolBusinessDateMap(pools);
  const projectLabelById = buildVesselProjectLabelMap(projects, vessels);
  const pendingSubmissions = getExpenseSubmissionsPendingReview(submissions);
  const latestReconciliationIds = getLatestReconciliationIdsByPool(reconciliations);
  const latestReconciliations = reconciliations.filter(
    (row) => row.reconciliation_id && latestReconciliationIds.has(row.reconciliation_id),
  );

  return (
    <AppShell title="Review & Approval" sectionLabel="Operasional" showMobileTitle={false}>
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review & Approval</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Status pengajuan, kandidat duplikasi, dan rekonsiliasi EOD yang sedang berjalan.
          {canApprove ? " Buka Owner Control untuk mengambil keputusan." : " Tampilan ini bersifat baca saja."}
        </p>
      </div>

      <Section title="Pengajuan Biaya Menunggu Review">
        {pendingSubmissions.length === 0 ? (
          <EmptyState text="Tidak ada pengajuan biaya yang menunggu review." />
        ) : (
          <Table
            head={["Tanggal", "Project Kapal", "Nominal", "Status"]}
            rows={pendingSubmissions.map((submission) => [
              submission.pool_id ? formatBusinessDateLabel(businessDateByPoolId.get(submission.pool_id) ?? "-") : "-",
              submission.project_id ? (projectLabelById.get(submission.project_id) ?? "-") : "-",
              formatRupiah(submission.amount),
              getExpenseSubmissionStatusLabel(submission.status!),
            ])}
          />
        )}
      </Section>

      <Section title="Kandidat Duplikasi Menunggu Review">
        {duplicateCandidates.length === 0 ? (
          <EmptyState text="Tidak ada kandidat duplikasi yang menunggu review." />
        ) : (
          <Table
            head={["Terdeteksi", "Alasan", "Status"]}
            rows={duplicateCandidates.map((candidate) => [
              candidate.detected_at ? new Date(candidate.detected_at).toLocaleString("id-ID") : "-",
              candidate.reason_code ? getExpenseDuplicateReasonLabel(candidate.reason_code) : "-",
              candidate.status ?? "-",
            ])}
          />
        )}
      </Section>

      <Section title="Status Rekonsiliasi EOD Terbaru">
        {latestReconciliations.length === 0 ? (
          <EmptyState text="Belum ada siklus rekonsiliasi EOD." />
        ) : (
          <Table
            head={["Tanggal", "Status"]}
            rows={latestReconciliations.map((row) => [
              row.pool_id ? formatBusinessDateLabel(businessDateByPoolId.get(row.pool_id) ?? "-") : "-",
              getCashReconciliationStatusLabel(row.status),
            ])}
          />
        )}
      </Section>

      {canSeeImportBatches ? (
        <Section title="Batch Import Data">
          <BatchList batches={importBatches} />
        </Section>
      ) : null}

      {canApprove ? (
        <Link
          href="/owner/control"
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Buka Owner Control
        </Link>
      ) : null}
    </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700">
      {text}
    </p>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            {head.map((label) => (
              <th key={label} className="px-4 py-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-neutral-200 dark:border-neutral-800">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
