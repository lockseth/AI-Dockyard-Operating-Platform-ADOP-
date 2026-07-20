"use client";

import { useActionState } from "react";
import {
  createCashReconciliationDraftAction,
  reviseCashReconciliationDraftAction,
  submitCashReconciliationAction,
} from "@/lib/operations-daily/actions";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import { FieldError, FormError } from "@/components/master-data/FormError";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import type { CashReconciliationResult } from "@/lib/cash-reconciliation/service";

const initialDraftState: CashReconciliationResult = {};
const initialSubmitState: CashReconciliationResult = {};

export function EodCloseSection({
  pool,
  summary,
  reconciliation,
  unresolvedExpenseCount,
}: {
  pool: CashPoolRow | null;
  summary: CashPoolDailySummaryRow | null;
  reconciliation: CashPoolReconciliationCurrentRow | null;
  unresolvedExpenseCount: number;
}) {
  const [draftState, draftFormAction, isSavingDraft] = useActionState(
    reconciliation ? reviseCashReconciliationDraftAction : createCashReconciliationDraftAction,
    reconciliation ? initialDraftState : initialDraftState,
  );
  const [submitState, submitFormAction, isSubmitting] = useActionState(
    submitCashReconciliationAction,
    initialSubmitState,
  );

  if (pool?.daily_close_status === "closed") {
    return (
      <section id="tutup-kas" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-semibold tracking-tight">4. Tutup Kas Hari Ini</h2>
        <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Kas hari ini sudah ditutup.
        </p>
      </section>
    );
  }

  const canMutateReconciliation =
    !!pool &&
    (!reconciliation ||
      reconciliation.status === "draft" ||
      reconciliation.status === "needs_correction" ||
      reconciliation.status === "rejected");
  const isAwaitingReview = reconciliation?.status === "submitted";
  const hasUnresolvedExpenses = unresolvedExpenseCount > 0;

  return (
    <section id="tutup-kas" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">4. Tutup Kas Hari Ini</h2>

      {!pool ? (
        <p className="mt-3 text-sm text-neutral-500">Kas hari ini belum dibuka.</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <SummaryRow label="Opening Cash" value={formatRupiah(summary?.opening_cash)} />
            <SummaryRow
              label="Total Cash-In (Top-Up + Lainnya)"
              value={formatRupiah((summary?.cash_top_up ?? 0) + (summary?.other_cash_in ?? 0))}
            />
            <SummaryRow label="Total Cash-Out" value={formatRupiah(summary?.total_cash_out)} />
            <SummaryRow label="Expected Closing Cash" value={formatRupiah(summary?.closing_cash)} />
            <SummaryRow label="Pengajuan Belum Final" value={String(unresolvedExpenseCount)} />
            <SummaryRow label="Status Rekonsiliasi" value={getCashReconciliationStatusLabel(reconciliation?.status ?? null)} />
          </dl>

          {hasUnresolvedExpenses ? (
            <p role="alert" className="mt-3 text-sm text-amber-600 dark:text-amber-400">
              Masih ada {unresolvedExpenseCount} pengajuan biaya yang belum memiliki keputusan final. Selesaikan
              pada{" "}
              <a href="#status-pengajuan" className="underline underline-offset-4">
                daftar Status Pengajuan
              </a>{" "}
              sebelum menutup kas.
            </p>
          ) : null}

          {isAwaitingReview ? (
            <p className="mt-3 text-sm text-neutral-500">
              Rekonsiliasi sedang menunggu review Pak Hanafi — form terkunci sampai ada keputusan.
            </p>
          ) : null}

          {reconciliation?.decision_reason ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              <span className="font-medium">Catatan Pak Hanafi:</span> {reconciliation.decision_reason}
            </p>
          ) : null}

          {reconciliation?.submitted_variance !== null && reconciliation?.submitted_variance !== undefined ? (
            <p className="mt-2 text-sm">
              <span className="font-medium">Variance submission terakhir:</span>{" "}
              {formatRupiah(reconciliation.submitted_variance)}
            </p>
          ) : null}

          {canMutateReconciliation ? (
            <form action={draftFormAction} className="mt-4 flex flex-col gap-4">
              {reconciliation ? <input type="hidden" name="reconciliationId" value={reconciliation.reconciliation_id ?? ""} /> : null}
              {!reconciliation ? <input type="hidden" name="poolId" value={pool.id} /> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="actualCountedCash" className="text-sm font-medium">
                    Kas Fisik Terhitung (Rp)
                  </label>
                  <input
                    id="actualCountedCash"
                    name="actualCountedCash"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={reconciliation?.actual_counted_cash ?? undefined}
                    className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                  />
                  <FieldError messages={draftState.fieldErrors?.actualCountedCash} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="explanation" className="text-sm font-medium">
                    Catatan / Penjelasan Selisih
                  </label>
                  <textarea
                    id="explanation"
                    name="explanation"
                    rows={2}
                    defaultValue={reconciliation?.explanation ?? undefined}
                    className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                  />
                  <FieldError messages={draftState.fieldErrors?.explanation} />
                </div>
              </div>
              <FormError error={draftState.error} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSavingDraft}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:border-neutral-400 disabled:opacity-60 dark:border-neutral-700"
                >
                  {isSavingDraft ? "Menyimpan..." : reconciliation ? "Simpan Revisi" : "Simpan Draft Rekonsiliasi"}
                </button>
              </div>
            </form>
          ) : null}

          {canMutateReconciliation && reconciliation ? (
            <form
              action={submitFormAction}
              onSubmit={(event) => {
                if (!window.confirm("Kirim rekonsiliasi kas hari ini untuk direview Pak Hanafi?")) {
                  event.preventDefault();
                }
              }}
              className="mt-3"
            >
              <input type="hidden" name="reconciliationId" value={reconciliation.reconciliation_id ?? ""} />
              <FormError error={submitState.error} />
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {isSubmitting ? "Mengirim..." : "Kirim ke Pak Hanafi"}
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
