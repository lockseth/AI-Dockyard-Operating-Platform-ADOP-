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
import { inputClassName } from "@/components/master-data/fields";
import { NumericTextInput } from "@/components/master-data/NumericTextInput";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import type { CashReconciliationResult } from "@/lib/cash-reconciliation/service";
import type { Tone } from "@/components/ui/tone";

const RECONCILIATION_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  submitted: "warning",
  needs_correction: "warning",
  approved: "success",
  rejected: "danger",
};

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
      <Card id="tutup-kas" className="scroll-mt-4">
        <h2 className="text-[20px] font-extrabold tracking-tight">Tutup Kas Hari Ini</h2>
        <Badge tone="success" dot className="mt-3">
          Kas hari ini sudah ditutup.
        </Badge>
      </Card>
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
    <Card id="tutup-kas" className="scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[20px] font-extrabold tracking-tight">Tutup Kas Hari Ini</h2>
        {pool ? (
          <Badge tone={RECONCILIATION_STATUS_TONE[reconciliation?.status ?? "draft"] ?? "neutral"} dot>
            {getCashReconciliationStatusLabel(reconciliation?.status ?? null)}
          </Badge>
        ) : null}
      </div>

      {!pool ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Kas hari ini belum dibuka.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard eyebrow="Opening Cash" value={formatRupiah(summary?.opening_cash)} />
            <StatCard
              eyebrow="Total Cash-In"
              value={formatRupiah((summary?.cash_top_up ?? 0) + (summary?.other_cash_in ?? 0))}
              note="Top-Up + Lainnya"
            />
            <StatCard eyebrow="Total Cash-Out" value={formatRupiah(summary?.total_cash_out)} />
            <StatCard eyebrow="Expected Closing Cash" value={formatRupiah(summary?.closing_cash)} />
            <StatCard eyebrow="Pengajuan Belum Final" value={String(unresolvedExpenseCount)} />
          </div>

          {hasUnresolvedExpenses ? (
            <Callout tone="warning" role="alert" className="mt-4 text-sm">
              Masih ada {unresolvedExpenseCount} pengajuan biaya yang belum memiliki keputusan final. Selesaikan
              pada{" "}
              <a href="#status-pengajuan" className="underline underline-offset-4">
                daftar Status Pengajuan
              </a>{" "}
              sebelum menutup kas.
            </Callout>
          ) : null}

          {isAwaitingReview ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
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
                  <label htmlFor="actualCountedCash" className="text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-300">
                    Kas Fisik Terhitung (Rp)
                  </label>
                  <NumericTextInput
                    id="actualCountedCash"
                    name="actualCountedCash"
                    required
                    defaultValue={reconciliation?.actual_counted_cash ?? undefined}
                    ariaInvalid={!!draftState.fieldErrors?.actualCountedCash?.length}
                    className={inputClassName}
                  />
                  <FieldError messages={draftState.fieldErrors?.actualCountedCash} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="explanation" className="text-[12.5px] font-semibold text-neutral-700 dark:text-neutral-300">
                    Catatan / Penjelasan Selisih
                  </label>
                  <textarea
                    id="explanation"
                    name="explanation"
                    rows={2}
                    defaultValue={reconciliation?.explanation ?? undefined}
                    className={inputClassName}
                  />
                  <FieldError messages={draftState.fieldErrors?.explanation} />
                </div>
              </div>
              <FormError error={draftState.error} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary" loading={isSavingDraft}>
                  {isSavingDraft ? "Menyimpan..." : reconciliation ? "Simpan Revisi" : "Simpan Draft Rekonsiliasi"}
                </Button>
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
              <Button type="submit" variant="primary" loading={isSubmitting}>
                {isSubmitting ? "Mengirim..." : "Kirim ke Pak Hanafi"}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </Card>
  );
}
