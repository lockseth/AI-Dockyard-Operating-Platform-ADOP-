"use client";

import { useActionState } from "react";
import { ensureDailyCashPoolAction } from "@/lib/operations-daily/actions";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel } from "@/lib/operations-daily/labels";
import { isCashPoolOpenForMutation } from "@/lib/operations-daily/view-model";
import { FormError } from "@/components/master-data/FormError";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { CashEntryForm } from "./CashEntryForm";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { EnsureDailyCashPoolResult } from "@/lib/cash-pool/service";
import type { CashPoolDailyCloseStatus } from "@/lib/cash-reconciliation/types";
import type { Tone } from "@/components/ui/tone";

const initialState: EnsureDailyCashPoolResult = {};

const STATUS_TONE: Record<CashPoolDailyCloseStatus, Tone> = {
  open: "success",
  pending_close: "warning",
  closed: "neutral",
};

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
  const statusTone: Tone = pool ? STATUS_TONE[pool.daily_close_status] : "neutral";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight">1. Buka Kas Hari Ini</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{formatBusinessDateLabel(businessDate)}</p>
        </div>
        <Badge tone={statusTone} dot>
          {getCashPoolDailyCloseStatusLabel(pool?.daily_close_status ?? null)}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard eyebrow="Opening Cash" value={formatRupiah(summary?.opening_cash)} />
        <StatCard eyebrow="Cash Top-Up" value={formatRupiah(summary?.cash_top_up)} />
        <StatCard eyebrow="Other Cash-In" value={formatRupiah(summary?.other_cash_in)} />
        <StatCard eyebrow="Total Cash-Out" value={formatRupiah(summary?.total_cash_out)} />
        <StatCard
          eyebrow="Expected Closing Cash"
          value={formatRupiah(summary?.closing_cash)}
          note="Saldo Awal + Cash-In − Cash-Out"
        />
      </div>

      {!pool ? (
        <form action={formAction} className="mt-4 flex flex-col items-start gap-2">
          <input type="hidden" name="businessDate" value={businessDate} />
          <FormError error={state.error} />
          <Button type="submit" variant="primary" loading={isPending}>
            {isPending ? "Membuka..." : "Buka Kas Hari Ini"}
          </Button>
        </form>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {pool.opening_cash_posted ? (
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <span className="text-sm font-medium">Catat Opening Cash</span>
              <Badge tone="danger" className="w-fit">
                BLOCKED
              </Badge>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
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
        <Callout tone="warning" className="mt-4 text-xs">
          Kas hari ini {getCashPoolDailyCloseStatusLabel(pool.daily_close_status)} — input finansial dikunci.
        </Callout>
      ) : null}
    </Card>
  );
}
