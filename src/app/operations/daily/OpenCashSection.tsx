"use client";

import { useActionState } from "react";
import { ensureDailyCashPoolAction } from "@/lib/operations-daily/actions";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel } from "@/lib/operations-daily/labels";
import { isCashPoolOpenForMutation } from "@/lib/operations-daily/view-model";
import { FormError } from "@/components/master-data/FormError";
import { CashEntryForm } from "./CashEntryForm";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { EnsureDailyCashPoolResult } from "@/lib/cash-pool/service";

const initialState: EnsureDailyCashPoolResult = {};

export function OpenCashSection({
  businessDate,
  pool,
  summary,
}: {
  businessDate: string;
  pool: CashPoolRow | null;
  summary: CashPoolDailySummaryRow | null;
}) {
  const [state, formAction, isPending] = useActionState(ensureDailyCashPoolAction, initialState);
  const mutationOpen = isCashPoolOpenForMutation(pool);

  return (
    <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">1. Buka Kas Hari Ini</h2>
      <p className="mt-1 text-sm text-neutral-500">{formatBusinessDateLabel(businessDate)}</p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Status Kas" value={getCashPoolDailyCloseStatusLabel(pool?.daily_close_status ?? null)} />
        <SummaryRow label="Opening Cash" value={formatRupiah(summary?.opening_cash)} />
        <SummaryRow label="Cash Top-Up" value={formatRupiah(summary?.cash_top_up)} />
        <SummaryRow label="Other Cash-In" value={formatRupiah(summary?.other_cash_in)} />
        <SummaryRow label="Total Cash-Out" value={formatRupiah(summary?.total_cash_out)} />
        <SummaryRow label="Expected Closing Cash" value={formatRupiah(summary?.closing_cash)} />
      </dl>

      {!pool ? (
        <form action={formAction} className="mt-4 flex flex-col items-start gap-2">
          <input type="hidden" name="businessDate" value={businessDate} />
          <FormError error={state.error} />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "Membuka..." : "Buka Kas Hari Ini"}
          </button>
        </form>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {pool.opening_cash_posted ? (
            <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <span className="text-sm font-medium">Catat Opening Cash</span>
              <span className="w-fit rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                BLOCKED
              </span>
              <p className="text-xs text-neutral-500">
                Saldo awal untuk {formatBusinessDateLabel(businessDate)} sudah diposting. Koreksi hanya dapat
                dilakukan melalui reversal di Riwayat Transaksi.
              </p>
            </div>
          ) : (
            <CashEntryForm
              poolId={pool.id}
              entryType="opening_cash"
              label="Catat Opening Cash"
              disabled={!mutationOpen}
              businessDate={businessDate}
            />
          )}
          <CashEntryForm poolId={pool.id} entryType="cash_top_up" label="Tambah Cash Top-Up" disabled={!mutationOpen} />
          <CashEntryForm poolId={pool.id} entryType="other_cash_in" label="Tambah Other Cash-In" disabled={!mutationOpen} />
        </div>
      )}

      {pool && !mutationOpen ? (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Kas hari ini {getCashPoolDailyCloseStatusLabel(pool.daily_close_status)} — input finansial dikunci.
        </p>
      ) : null}
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
