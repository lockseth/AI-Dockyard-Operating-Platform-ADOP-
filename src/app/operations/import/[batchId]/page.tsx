import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import {
  canApproveCashImportStaging,
  canReadCashImportStaging,
  canRollbackCashImportStaging,
  canWriteCashImportStaging,
} from "@/lib/cash-import-staging/access";
import { getCashImportBatchDetailForActiveTenant } from "@/lib/cash-import-staging/service";
import { summarizeCashImportBatchDecisions, summarizeCashImportLabels } from "@/lib/cash-import-staging/label-summary";
import { buildCanonicalCommitPreview } from "@/lib/cash-import-staging/canonical-preview";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { Disclosure } from "@/components/ui/Disclosure";
import { AccessDenied } from "../AccessDenied";
import { StagingBanner } from "../StagingBanner";
import { AuditTimeline } from "./AuditTimeline";
import { AutoApplyControl } from "./AutoApplyControl";
import { BatchSummaryPanel } from "./BatchSummaryPanel";
import { CommittedSummaryPanel } from "./CommittedSummaryPanel";
import { DecisionSummaryPanel } from "./DecisionSummaryPanel";
import { ImportPreviewPanel } from "./ImportPreviewPanel";
import { LabelMappingControl } from "./LabelMappingControl";
import { OwnerApprovalControl } from "./OwnerApprovalControl";
import { ReadyForReviewControl } from "./ReadyForReviewControl";
import { RollbackControl } from "./RollbackControl";
import { RolledBackSummaryPanel } from "./RolledBackSummaryPanel";
import { RowTable } from "./RowTable";

export default async function CashImportBatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ reopened?: string }>;
}) {
  const context = await requireTenantContext();
  const canRead = canReadCashImportStaging(context.roles);
  const canApprove = canApproveCashImportStaging(context.roles);
  const canRollback = canRollbackCashImportStaging(context.roles);
  const canWrite = canWriteCashImportStaging(context.roles);

  if (!canRead) {
    return (
      <AppShell title="Detail Batch Import" sectionLabel="Manajemen Data">
        <AccessDenied />
      </AppShell>
    );
  }

  const { batchId } = await params;
  const { reopened } = await searchParams;

  const detail = await getCashImportBatchDetailForActiveTenant({ batchId });
  if (!detail) {
    notFound();
  }

  const isCommitted = detail.batch.status === "committed";
  const isRolledBack = detail.batch.status === "rolled_back";
  // Staging (mapping/disposition) is frozen forever once a batch reaches
  // either terminal state — a rollback un-does the canonical postings, it
  // never reopens staging for a second, different commit attempt.
  const canEditStaging = canWrite && !isCommitted && !isRolledBack;

  const vesselProjects = canEditStaging ? await listVesselProjectsForActiveTenant() : [];
  const labelSummaries = summarizeCashImportLabels(detail.rows, detail.candidatePlans);
  const mappingIncomplete = labelSummaries.some(
    (label) =>
      label.mappingKind === null || (label.mappingKind === "existing_vessel_project" && !label.mappedVesselProjectId),
  );
  // Gate 6I-A: a candidate label with at least one included row still needs
  // its creation plan completed before the batch can go to review — mirrors
  // mark_cash_import_batch_ready_for_review's own CANDIDATE_PLAN_INCOMPLETE
  // guard.
  const candidatePlanIncomplete = labelSummaries.some(
    (label) => label.mappingKind === "new_project_candidate" && !label.candidatePlan,
  );
  const dispositionIncomplete = detail.rows.some(
    (row) => row.provisional_classification !== "opening_cash" && row.disposition === null,
  );
  const readyBlocked =
    detail.batch.error_count > 0 ||
    mappingIncomplete ||
    candidatePlanIncomplete ||
    dispositionIncomplete ||
    detail.hasOpeningBalanceConflict;
  // Computed for every status (not only ready_for_review) so the Preview
  // panel — and its OPENING_BALANCE_CONFLICT signal — is visible before the
  // batch is even submitted, per the locked Upload → Staging → Mapping →
  // Validasi → Preview → Ajukan Import → Setujui & Import flow.
  const canonicalPreview = buildCanonicalCommitPreview(
    detail.batch,
    detail.rows,
    detail.hasOpeningBalanceConflict,
    detail.candidatePlans,
  );
  const decisionSummary = summarizeCashImportBatchDecisions(
    detail.batch,
    detail.rows,
    detail.candidatePlans,
    detail.hasOpeningBalanceConflict,
  );
  const includedTransactionCount = detail.rows.filter(
    (row) => row.provisional_classification !== "opening_cash" && row.disposition === "include",
  ).length;

  return (
    <AppShell title="Detail Batch Import" sectionLabel="Manajemen Data">
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <Link
        href="/operations/import"
        className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        &larr; Kembali ke Daftar Batch
      </Link>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <StagingBanner />

        {reopened === "1" ? (
          <div
            role="status"
            className="w-fit rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
          >
            File ini sudah pernah dianalisis. Membuka batch yang sudah ada.
          </div>
        ) : null}

        {!canWrite && !canApprove ? (
          <p className="text-xs text-neutral-500">
            Tampilan baca-saja — hanya Admin yang dapat mengubah mapping, disposisi, dan menyiapkan batch untuk review.
          </p>
        ) : null}
        {isCommitted || isRolledBack ? (
          <p className="text-xs text-neutral-500">
            Batch ini sudah disetujui dan dimasukkan ke data operasional — staging bersifat baca-saja.
          </p>
        ) : null}

        <BatchSummaryPanel batch={detail.batch} />
        <DecisionSummaryPanel summary={decisionSummary} isCommitted={isCommitted} />

        {isCommitted ? <CommittedSummaryPanel batch={detail.batch} /> : null}
        {isRolledBack ? <RolledBackSummaryPanel batch={detail.batch} /> : null}

        {!isCommitted && !isRolledBack ? (
          <ImportPreviewPanel rows={detail.rows} preview={canonicalPreview} />
        ) : null}

        {canEditStaging ? <AutoApplyControl batchId={detail.batch.id} /> : null}

        {canApprove && detail.batch.status === "ready_for_review" ? (
          <OwnerApprovalControl
            batchId={detail.batch.id}
            preview={canonicalPreview}
            candidateProjectCount={decisionSummary.candidateProjectCount}
            includedTransactionCount={includedTransactionCount}
          />
        ) : null}

        {canRollback && isCommitted ? <RollbackControl batchId={detail.batch.id} batch={detail.batch} /> : null}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">
            Mapping Label Kapal/Kategori ({labelSummaries.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {labelSummaries.map((label) => (
              <LabelMappingControl
                key={`${label.vesselLabel ?? "unlabeled"}-${label.mappingKind ?? "unset"}-${label.mappedVesselProjectId ?? ""}`}
                batchId={detail.batch.id}
                label={label}
                vesselProjects={vesselProjects}
                clients={detail.clients}
                serviceTypes={detail.serviceTypes}
                facilityLocations={detail.facilityLocations}
                defaultStartDate={detail.batch.business_date}
                canWrite={canEditStaging}
              />
            ))}
          </ul>
        </section>

        <RowTable batchId={detail.batch.id} rows={detail.rows} canWrite={canEditStaging} />

        <Disclosure title="Riwayat Aktivitas" defaultOpen={false} summary={`${detail.events.length} peristiwa`}>
          <AuditTimeline events={detail.events} />
        </Disclosure>

        {canEditStaging ? (
          <section className="flex flex-col gap-2 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            <ReadyForReviewControl
              batchId={detail.batch.id}
              disabled={detail.batch.status === "ready_for_review" || readyBlocked}
            />
            {readyBlocked && detail.batch.status !== "ready_for_review" ? (
              <p className="text-xs text-neutral-500">
                Lengkapi mapping label dan disposisi setiap baris (termasuk rencana kandidat project baru: client,
                service type, dan tanggal mulai), dan pastikan tidak ada baris error, sebelum menyiapkan batch untuk
                review.
              </p>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
    </AppShell>
  );
}
