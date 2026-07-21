import type { CanonicalCommitPreview } from "@/lib/cash-import-staging/canonical-preview";
import { BLOCKER_LABEL } from "@/lib/cash-import-staging/blocker-labels";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportRowRow } from "@/lib/cash-import-staging/repository";

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
        <StatRow label="Valid" value={String(validCount)} tone="ok" />
        <StatRow label="Warning" value={String(warningCount)} tone={warningCount > 0 ? "warn" : undefined} />
        <StatRow label="Error/Blocked" value={String(errorCount)} tone={errorCount > 0 ? "bad" : undefined} />
        <StatRow label="Kandidat Duplikat" value={String(duplicateCount)} tone={duplicateCount > 0 ? "warn" : undefined} />
        <StatRow label="Total Dampak Kas" value={formatRupiah(totalCashImpact)} />
        <StatRow label="Total Project Cost" value={formatRupiah(preview.netProjectCost)} />
        <StatRow label="Shared Overhead" value={formatRupiah(preview.sharedOverheadTotal)} />
        <StatRow label="Refund/Cash-In" value={formatRupiah(preview.projectRefundTotal)} />
      </dl>

      {preview.blockers.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">BLOCKED — belum dapat diajukan/disetujui:</p>
          <ul className="mt-1 list-disc pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{BLOCKER_LABEL[blocker]}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Tidak ada blocker — batch ini siap diajukan untuk review.
        </p>
      )}
    </section>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-700 dark:text-red-400"
          : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${toneClass}`}>{value}</dd>
    </div>
  );
}
