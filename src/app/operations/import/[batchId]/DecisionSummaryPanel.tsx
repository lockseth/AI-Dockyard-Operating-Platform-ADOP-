import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportBatchDecisionSummary } from "@/lib/cash-import-staging/label-summary";

// Contract's required rollup: total/auto-decided/manual-review/blocked rows,
// existing-project/candidate-project counts, and the canonical cost/
// reconciliation totals — so an admin never has to open hundreds of valid
// rows one by one just to see the shape of a batch.
//
// Gate 6I-C: once a batch is committed, "Otomatis Diputuskan" (derived from
// disposition_reason's best-effort auto/manual provenance hint) is replaced
// with "Transaksi Dimasukkan" (summary.includedRows) — a reliable count read
// straight off each row's own committed disposition, so the applied-batch
// summary represents the committed outcome honestly instead of a provenance
// signal that was never guaranteed to survive to commit time.
export function DecisionSummaryPanel({
  summary,
  isCommitted = false,
}: {
  summary: CashImportBatchDecisionSummary;
  isCommitted?: boolean;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium text-neutral-500">Ringkasan Keputusan</h2>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Total Baris" value={String(summary.totalRows)} />
        {isCommitted ? (
          <Stat label="Transaksi Dimasukkan" value={String(summary.includedRows)} />
        ) : (
          <Stat label="Otomatis Diputuskan" value={String(summary.autoDecidedRows)} />
        )}
        <Stat label="Perlu Tinjauan Manual" value={String(summary.manualReviewRows)} emphasize={summary.manualReviewRows > 0} />
        <Stat label="Blocked" value={String(summary.blockedRows)} emphasize={summary.blockedRows > 0} />
        <Stat label="Mapping Project Existing" value={String(summary.existingProjectMappingCount)} />
        <Stat label="Kandidat Project Baru" value={String(summary.candidateProjectCount)} />
        <Stat label="Total Project Cost" value={formatRupiah(summary.projectCostTotal)} />
        <Stat label="Total Overhead" value={formatRupiah(summary.overheadTotal)} />
        <Stat label="Total Cash-In/Refund" value={formatRupiah(summary.cashInRefundTotal)} />
        <Stat
          label="Variance Rekonsiliasi"
          value={formatRupiah(summary.reconciliationVariance)}
          emphasize={summary.reconciliationVariance !== 0}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${emphasize ? "text-red-600 dark:text-red-400" : ""}`}>{value}</dd>
    </div>
  );
}
