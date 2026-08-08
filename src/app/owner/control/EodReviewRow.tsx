"use client";

import { useActionState, useState } from "react";
import {
  approveCashReconciliationOwnerAction,
  rejectCashReconciliationOwnerAction,
  reopenCashPoolOwnerAction,
  requestCashReconciliationCorrectionOwnerAction,
} from "@/lib/owner-control/actions";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getCashReconciliationStatusLabel } from "@/lib/operations-daily/labels";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import type { CashPoolResult, CashReconciliationResult } from "@/lib/cash-reconciliation/service";
import type { EodReviewItem } from "./EodReviewSection";

const initialDecisionState: CashReconciliationResult = {};
const initialReopenState: CashPoolResult = {};

type DecisionKind = "reject" | "correction";

export function EodReviewRow({ item }: { item: EodReviewItem }) {
  const { reconciliation, isLatestForPool, unresolvedExpenseCount } = item;
  const reconciliationId = reconciliation.reconciliation_id ?? "";
  const poolId = reconciliation.pool_id ?? "";

  const [activeDecision, setActiveDecision] = useState<DecisionKind | null>(null);
  const [isReopening, setIsReopening] = useState(false);

  const [approveState, approveFormAction, isApproving] = useActionState(
    approveCashReconciliationOwnerAction,
    initialDecisionState,
  );
  const [rejectState, rejectFormAction, isRejecting] = useActionState(
    rejectCashReconciliationOwnerAction,
    initialDecisionState,
  );
  const [correctionState, correctionFormAction, isCorrecting] = useActionState(
    requestCashReconciliationCorrectionOwnerAction,
    initialDecisionState,
  );
  const [reopenState, reopenFormAction, isReopeningRequest] = useActionState(
    reopenCashPoolOwnerAction,
    initialReopenState,
  );

  const canDecide = isLatestForPool && reconciliation.status === "submitted";
  const canReopen = isLatestForPool && reconciliation.pool_daily_close_status === "closed";
  const blockedByUnresolvedExpenses = canDecide && unresolvedExpenseCount > 0;

  // Collapsed-row summary — identity + the data an owner needs to decide
  // whether to open this row at all, mirroring the always-visible fields
  // the row used to show before it was wrapped in a Disclosure.
  const summary = [
    `${getCashReconciliationStatusLabel(reconciliation.status)}${!isLatestForPool ? " · Riwayat" : ""}`,
    `Expected Closing ${formatRupiah(reconciliation.submitted_expected_closing_cash)}`,
    `Variance ${formatRupiah(reconciliation.submitted_variance)}`,
  ].join(" · ");

  return (
    <li>
      <Disclosure
        title={reconciliation.business_date ? formatBusinessDateLabel(reconciliation.business_date) : "-"}
        summary={summary}
        hasError={blockedByUnresolvedExpenses}
        errorLabel="Ada Pengajuan Belum Selesai"
      >
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Opening Cash" value={formatRupiah(reconciliation.submitted_opening_cash)} />
          <Row label="Cash Top-Up" value={formatRupiah(reconciliation.submitted_cash_top_up)} />
          <Row label="Cash-In Lainnya" value={formatRupiah(reconciliation.submitted_other_cash_in)} />
          <Row label="Total Cash-Out" value={formatRupiah(reconciliation.submitted_total_cash_out)} />
          <Row label="Expected Closing" value={formatRupiah(reconciliation.submitted_expected_closing_cash)} />
          <Row label="Kas Fisik Terhitung" value={formatRupiah(reconciliation.actual_counted_cash)} />
          <Row label="Variance" value={formatRupiah(reconciliation.submitted_variance)} />
          <Row label="Financial Version" value={String(reconciliation.submitted_financial_version ?? "-")} />
          <Row label="Submitter (User ID)" value={reconciliation.submitted_by ?? "-"} />
          <Row label="Status Kas" value={reconciliation.pool_daily_close_status ?? "-"} />
        </dl>

        {reconciliation.explanation ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">Catatan Admin:</span> {reconciliation.explanation}
          </p>
        ) : null}

        {reconciliation.decision_reason ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">Alasan Keputusan:</span> {reconciliation.decision_reason}
          </p>
        ) : null}

        {reconciliation.is_stale ? (
          <p role="alert" className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Data keuangan cash pool berubah sejak rekonsiliasi ini disubmit. Admin perlu membuat revisi baru dan submit
            ulang.
          </p>
        ) : null}

        {blockedByUnresolvedExpenses ? (
          <p role="alert" className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Masih ada {unresolvedExpenseCount} pengajuan biaya yang belum memiliki keputusan final. Selesaikan pada{" "}
            <a href="#tinjauan-biaya" className="underline underline-offset-4">
              Tinjauan Pengajuan Biaya
            </a>{" "}
            sebelum menyetujui penutupan kas ini.
          </p>
        ) : null}

        {canDecide ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <form
                action={approveFormAction}
                onSubmit={(event) => {
                  if (!window.confirm("Setujui penutupan kas (EOD) untuk business date ini?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="reconciliationId" value={reconciliationId} />
                <Button type="submit" variant="primary" size="sm" loading={isApproving} disabled={isApproving}>
                  {isApproving ? "Memproses..." : "Setujui Penutupan"}
                </Button>
              </form>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setActiveDecision((prev) => (prev === "reject" ? null : "reject"))}
              >
                {activeDecision === "reject" ? "Batal" : "Tolak"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setActiveDecision((prev) => (prev === "correction" ? null : "correction"))}
              >
                {activeDecision === "correction" ? "Batal" : "Minta Koreksi"}
              </Button>
            </div>

            <FormError error={approveState.error} />

            {activeDecision === "reject" ? (
              <form
                action={rejectFormAction}
                onSubmit={(event) => {
                  const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
                  if (!reason) {
                    event.preventDefault();
                    return;
                  }
                  if (!window.confirm("Tolak rekonsiliasi kas ini?")) {
                    event.preventDefault();
                  }
                }}
                className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
              >
                <input type="hidden" name="reconciliationId" value={reconciliationId} />
                <label htmlFor={`eod-reject-reason-${reconciliationId}`} className="text-sm font-medium">
                  Alasan Penolakan
                </label>
                <textarea
                  id={`eod-reject-reason-${reconciliationId}`}
                  name="reason"
                  required
                  rows={2}
                  className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                />
                <FieldError messages={rejectState.fieldErrors?.reason} />
                <FormError error={rejectState.error} />
                <div>
                  <Button type="submit" variant="destructive" loading={isRejecting} disabled={isRejecting}>
                    {isRejecting ? "Menolak..." : "Konfirmasi Tolak"}
                  </Button>
                </div>
              </form>
            ) : null}

            {activeDecision === "correction" ? (
              <form
                action={correctionFormAction}
                onSubmit={(event) => {
                  const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
                  if (!reason) {
                    event.preventDefault();
                    return;
                  }
                  if (!window.confirm("Minta koreksi untuk rekonsiliasi kas ini?")) {
                    event.preventDefault();
                  }
                }}
                className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800"
              >
                <input type="hidden" name="reconciliationId" value={reconciliationId} />
                <label htmlFor={`eod-correction-reason-${reconciliationId}`} className="text-sm font-medium">
                  Alasan Koreksi
                </label>
                <textarea
                  id={`eod-correction-reason-${reconciliationId}`}
                  name="reason"
                  required
                  rows={2}
                  className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                />
                <FieldError messages={correctionState.fieldErrors?.reason} />
                <FormError error={correctionState.error} />
                <div>
                  <Button type="submit" variant="secondary" loading={isCorrecting} disabled={isCorrecting}>
                    {isCorrecting ? "Mengirim..." : "Konfirmasi Minta Koreksi"}
                  </Button>
                </div>
              </form>
            ) : null}
          </>
        ) : null}

        {canReopen ? (
          <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setIsReopening((prev) => !prev)}
              className="rounded-md border border-amber-400 px-3 py-1.5 text-sm text-amber-700 transition-colors hover:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:border-amber-700 dark:text-amber-400"
            >
              {isReopening ? "Batal" : "Buka Kembali Kas Ini"}
            </button>

            {isReopening ? (
              <form
                action={reopenFormAction}
                onSubmit={(event) => {
                  const reason = (new FormData(event.currentTarget).get("reason") as string | null)?.trim();
                  if (!reason) {
                    event.preventDefault();
                    return;
                  }
                  if (
                    !window.confirm(
                      "Membuka kembali kas yang sudah closed akan mengizinkan transaksi baru pada business date ini, dan rekonsiliasi EOD baru wajib dibuat ulang. Lanjutkan?",
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
                className="mt-3 flex flex-col gap-2"
              >
                <input type="hidden" name="poolId" value={poolId} />
                <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
                  Peringatan: transaksi baru dapat kembali dilakukan pada kas ini, dan EOD baru wajib dibuat sebelum
                  dapat ditutup kembali.
                </p>
                <label htmlFor={`reopen-reason-${poolId}`} className="text-sm font-medium">
                  Alasan Pembukaan Kembali
                </label>
                <textarea
                  id={`reopen-reason-${poolId}`}
                  name="reason"
                  required
                  rows={2}
                  className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
                />
                <FieldError messages={reopenState.fieldErrors?.reason} />
                <FormError error={reopenState.error} />
                <div>
                  <button
                    type="submit"
                    disabled={isReopeningRequest}
                    className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60"
                  >
                    {isReopeningRequest ? "Membuka..." : "Konfirmasi Buka Kembali"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
      </Disclosure>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
