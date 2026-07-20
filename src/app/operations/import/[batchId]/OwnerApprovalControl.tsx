"use client";

import { useActionState, useState } from "react";
import { approveAndCommitCashImportBatchAction, rejectCashImportBatchAction } from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import type { CanonicalCommitPreview, CommitBlocker } from "@/lib/cash-import-staging/canonical-preview";
import { formatRupiah } from "@/lib/operations-daily/format";
import { FormError } from "@/components/master-data/FormError";

const initialState: CashImportStagingActionResult = {};

const BLOCKER_LABEL: Record<CommitBlocker, string> = {
  MAPPING_INCOMPLETE: "Masih ada label kapal yang belum dipetakan.",
  DISPOSITION_INCOMPLETE: "Masih ada baris yang belum memiliki keputusan (disposisi).",
  MANUAL_REVIEW_UNRESOLVED: "Masih ada baris berstatus 'Perlu Tinjauan Manual' yang belum diputuskan.",
  MAPPING_NOT_COMMITTABLE: "Ada baris dengan mapping kandidat proyek baru/unresolved — belum dapat dimasukkan ke data operasional.",
  VALIDATION_ERRORS_PRESENT: "Masih ada baris berstatus error.",
  RECONCILIATION_VARIANCE: "Saldo penutup workbook belum rekonsiliasi dengan hasil hitung ulang.",
};

// Owner-only review surface on the batch detail page — shown only while the
// batch is ready_for_review. approveAndCommitCashImportBatchAction /
// rejectCashImportBatchAction are the only two server actions this renders;
// every total shown here is a COSMETIC preview (buildCanonicalCommitPreview)
// — the RPC re-validates and computes the real canonical totals itself.
export function OwnerApprovalControl({ batchId, preview }: { batchId: string; preview: CanonicalCommitPreview }) {
  const [approveState, approveFormAction, approvePending] = useActionState(
    approveAndCommitCashImportBatchAction,
    initialState,
  );
  const [rejectState, rejectFormAction, rejectPending] = useActionState(rejectCashImportBatchAction, initialState);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const blocked = preview.blockers.length > 0;
  const hasSkipVariance = preview.skippedDebitTotal !== 0 || preview.skippedCreditTotal !== 0;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
      <h2 className="text-sm font-medium text-neutral-500">Persetujuan Owner</h2>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <PreviewRow label="Saldo Awal (Opening)" value={formatRupiah(preview.openingCash)} />
        <PreviewRow label="Cash Top-Up" value={formatRupiah(preview.cashTopUpTotal)} />
        <PreviewRow label="Project Refund" value={formatRupiah(preview.projectRefundTotal)} />
        <PreviewRow label="Project Expense" value={formatRupiah(preview.projectExpenseTotal)} />
        <PreviewRow label="Shared Overhead" value={formatRupiah(preview.sharedOverheadTotal)} />
        <PreviewRow label="Net Project Cost" value={formatRupiah(preview.netProjectCost)} />
        <PreviewRow label="Expected Canonical Closing" value={formatRupiah(preview.expectedClosingCash)} emphasize />
      </dl>

      {hasSkipVariance ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Baris yang di-skip: debit {formatRupiah(preview.skippedDebitTotal)}, kredit{" "}
          {formatRupiah(preview.skippedCreditTotal)} — variance terhadap source{" "}
          {formatRupiah(preview.skippedVarianceFromSource)} (tidak dimasukkan ke data operasional).
        </p>
      ) : null}

      {blocked ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <p className="font-medium">Belum dapat disetujui:</p>
          <ul className="mt-1 list-disc pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker}>{BLOCKER_LABEL[blocker]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <form action={approveFormAction} className="flex flex-1 flex-col gap-2">
          <input type="hidden" name="batchId" value={batchId} />
          <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5"
            />
            <span>Persetujuan akan memasukkan transaksi ke kas dan biaya operasional.</span>
          </label>
          <button
            type="submit"
            disabled={approvePending || blocked || !confirmed}
            className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {approvePending ? "Memproses..." : "Setujui dan Masukkan Data"}
          </button>
          <FormError error={approveState.error} />
        </form>

        <div className="flex flex-1 flex-col gap-2">
          {showRejectForm ? (
            <form action={rejectFormAction} className="flex flex-col gap-2">
              <input type="hidden" name="batchId" value={batchId} />
              <textarea
                name="reason"
                required
                placeholder="Alasan penolakan (wajib diisi)..."
                rows={2}
                className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-700"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={rejectPending}
                  className="w-fit rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                >
                  {rejectPending ? "Memproses..." : "Kirim Penolakan"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRejectForm(false)}
                  className="w-fit rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
                >
                  Batal
                </button>
              </div>
              <FormError error={rejectState.error} />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowRejectForm(true)}
              className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
            >
              Tolak dan Kembalikan ke Admin
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function PreviewRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white/60 px-3 py-2 dark:bg-neutral-950/40">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${emphasize ? "text-blue-700 dark:text-blue-300" : ""}`}>{value}</dd>
    </div>
  );
}
