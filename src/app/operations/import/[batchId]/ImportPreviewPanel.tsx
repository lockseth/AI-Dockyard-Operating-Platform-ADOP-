import type { CanonicalCommitPreview } from "@/lib/cash-import-staging/canonical-preview";
import { BLOCKER_LABEL } from "@/lib/cash-import-staging/blocker-labels";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportRowRow } from "@/lib/cash-import-staging/repository";
import { Callout } from "@/components/ui/Callout";
import { TEXT_TONE_CLASSES, type Tone } from "@/components/ui/tone";

// The genuine "Preview" step the LOCK's Upload → Staging → Mapping →
// Validasi → Preview → Ajukan Import → Setujui & Import flow calls for —
// shown read-only above "Ajukan Import" on every batch (not only once
// ready_for_review), reusing the exact same buildCanonicalCommitPreview
// bucket math OwnerApprovalControl already renders one step later. Numbers
// here are cosmetic; the RPC re-validates and computes the real canonical
// totals at commit time.
export function ImportPreviewPanel({ rows, preview }: { rows: CashImportRowRow[]; preview: CanonicalCommitPreview }) {
  const rowCount = rows.length;
  const validCount = rows.filter((row) => row.status === "valid").length;
  const warningCount = rows.filter((row) => row.status === "warning").length;
  const errorCount = rows.filter((row) => row.status === "error").length;
  const duplicateCount = rows.filter((row) => row.duplicate_group_key !== null).length;
  const totalCashImpact = preview.openingCash + preview.cashTopUpTotal + preview.projectRefundTotal - preview.projectExpenseTotal - preview.sharedOverheadTotal;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-medium text-neutral-500">Preview</h2>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <StatRow label="Jumlah Baris" value={String(rowCount)} />
        <StatRow label="Valid" value={String(validCount)} tone="success" />
        <StatRow label="Warning" value={String(warningCount)} tone={warningCount > 0 ? "warning" : undefined} />
        <StatRow label="Error/Blocked" value={String(errorCount)} tone={errorCount > 0 ? "danger" : undefined} />
        <StatRow
          label="Kandidat Duplikat"
          value={String(duplicateCount)}
          tone={duplicateCount > 0 ? "warning" : undefined}
        />
        <StatRow label="Total Dampak Kas" value={formatRupiah(totalCashImpact)} />
        <StatRow label="Total Project Cost" value={formatRupiah(preview.netProjectCost)} />
        <StatRow label="Shared Overhead" value={formatRupiah(preview.sharedOverheadTotal)} />
        <StatRow label="Refund/Cash-In" value={formatRupiah(preview.projectRefundTotal)} />
      </dl>

      {preview.blockers.length > 0 ? (
        <Callout
          tone="danger"
          title="BLOCKED — belum dapat diajukan/disetujui:"
          titleClassName="text-xs font-medium"
          className="text-xs"
        >
          <ul className="mt-1 list-disc pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{BLOCKER_LABEL[blocker]}</li>
            ))}
          </ul>
        </Callout>
      ) : (
        <p className={`text-xs ${TEXT_TONE_CLASSES.success}`}>
          Tidak ada blocker — batch ini siap diajukan untuk review.
        </p>
      )}
    </section>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${tone ? TEXT_TONE_CLASSES[tone] : ""}`}>{value}</dd>
    </div>
  );
}
