"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getCashPoolDailyCloseStatusLabel } from "@/lib/operations-daily/labels";
import { DailySummaryPanel } from "./DailySummaryPanel";
import { TodayTransactionsTable } from "./TodayTransactionsTable";
import { TransactionWorkspace } from "./TransactionWorkspace";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";
import type { Tone } from "@/components/ui/tone";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";

const BANNER_TONE: Record<string, Tone> = {
  open: "success",
  pending_close: "warning",
  closed: "neutral",
};

const BANNER_TEXT: Record<string, string> = {
  open: "Operasional Berjalan — Transaksi dapat dicatat hingga hari ditutup.",
  pending_close: "Menunggu Penutupan — rekonsiliasi sedang menunggu review Pak Hanafi.",
  closed: "Kas hari ini sudah ditutup.",
};

// Everything below the AppShell title block for an open pool: KPI cards,
// the "+ Tambah Transaksi" workspace toggle, the trusted-ledger table for
// today, and the Ringkasan Hari Ini panel — grouped into one client island
// so the header trigger and the workspace it opens share state, matching
// the approved prototype's layout. Server-fetched data comes in as props;
// no fetching happens in this component.
export function DailyOperationsBody({
  pool,
  summary,
  mutationOpen,
  todayTransactions,
  pendingReviewCount,
  duplicateCandidateCount,
  largestExpense,
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
}: {
  pool: CashPoolRow;
  summary: CashPoolDailySummaryRow | null;
  mutationOpen: boolean;
  todayTransactions: TrustedTransactionRow[];
  pendingReviewCount: number;
  duplicateCandidateCount: number;
  largestExpense: { label: string; amount: number } | null;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions: VesselProjectOption[];
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const status = pool.daily_close_status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={BANNER_TONE[status] ?? "neutral"} dot>
          {BANNER_TEXT[status] ?? getCashPoolDailyCloseStatusLabel(status)}
        </Badge>
        <div className="flex items-center gap-2">
          {status !== "closed" ? (
            <a
              href="#tutup-kas"
              className="inline-flex h-10 items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-white px-[18px] text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Tutup Operasional Hari Ini
            </a>
          ) : null}
          {!workspaceOpen ? (
            <Button type="button" variant="primary" onClick={() => setWorkspaceOpen(true)} disabled={!mutationOpen}>
              + Tambah Transaksi
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard eyebrow="Saldo Awal" value={formatRupiah(summary?.opening_cash)} note={pool.opening_cash_posted ? "Terkunci" : undefined} />
        <StatCard eyebrow="Kas Masuk" value={formatRupiah((summary?.cash_top_up ?? 0) + (summary?.other_cash_in ?? 0))} />
        <StatCard eyebrow="Kas Keluar" value={formatRupiah(summary?.total_cash_out)} />
        <StatCard eyebrow="Saldo Akhir" value={formatRupiah(summary?.closing_cash)} note="Terhitung sistem" />
      </div>

      {workspaceOpen ? (
        <TransactionWorkspace
          poolId={pool.id}
          businessDate={pool.business_date}
          mutationOpen={mutationOpen}
          openingCashAlreadyPosted={pool.opening_cash_posted}
          projectOptions={projectOptions}
          categoryOptions={categoryOptions}
          vendorOptions={vendorOptions}
          facilityOptions={facilityOptions}
          onClose={() => setWorkspaceOpen(false)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <TodayTransactionsTable transactions={todayTransactions} />
        <DailySummaryPanel
          transactionCount={todayTransactions.length}
          pendingReviewCount={pendingReviewCount}
          duplicateCandidateCount={duplicateCandidateCount}
          largestExpense={largestExpense}
        />
      </div>
    </div>
  );
}
