"use client";

import { useActionState, useState } from "react";
import { rollbackCashImportBatchAction } from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import { formatRupiah } from "@/lib/operations-daily/format";
import { FormError } from "@/components/master-data/FormError";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

const initialState: CashImportStagingActionResult = {};

// Owner-only control on a COMMITTED batch's detail page. Reversal values
// shown here are read straight off the batch's own server-computed
// canonical_* snapshot (Gate 1J-C) — the exact totals rollback_cash_import_
// batch will reverse, never recomputed client-side. Two-step confirm: enter
// a reason, review the reversal summary, then confirm — matching the LOCK's
// "Wajib: input alasan; dialog konfirmasi; ringkasan nilai yang akan
// dibalik" requirement.
export function RollbackControl({ batchId, batch }: { batchId: string; batch: CashImportBatchRow }) {
  const [state, formAction, pending] = useActionState(rollbackCashImportBatchAction, initialState);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const netProjectCost = (batch.canonical_project_expense_total ?? 0) - (batch.canonical_project_refund_total ?? 0);

  if (!showConfirm) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50/40 p-4 dark:border-red-900 dark:bg-red-950/20">
        <h2 className="text-sm font-medium text-neutral-500">Batalkan Import</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Batalkan batch ini jika data yang sudah dimasukkan ternyata keliru. Rollback tidak menghapus riwayat — ADOP
          akan membuat transaksi pembalik.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
        >
          Batalkan Import
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border border-red-300 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/30">
      <h2 className="text-sm font-medium text-red-800 dark:text-red-300">Konfirmasi Batalkan Import</h2>

      <p className="text-sm text-red-800 dark:text-red-300">
        Rollback tidak menghapus riwayat. ADOP akan membuat transaksi pembalik untuk mengembalikan saldo dan biaya ke
        kondisi sebelum import.
      </p>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <PreviewRow label="Saldo Awal (Opening)" value={formatRupiah(batch.canonical_opening_cash ?? 0)} />
        <PreviewRow label="Cash Top-Up" value={formatRupiah(batch.canonical_cash_top_up_total ?? 0)} />
        <PreviewRow label="Project Refund" value={formatRupiah(batch.canonical_project_refund_total ?? 0)} />
        <PreviewRow label="Project Expense" value={formatRupiah(batch.canonical_project_expense_total ?? 0)} />
        <PreviewRow label="Shared Overhead" value={formatRupiah(batch.canonical_shared_overhead_total ?? 0)} />
        <PreviewRow label="Net Project Cost" value={formatRupiah(netProjectCost)} />
        <PreviewRow label="Canonical Closing Cash" value={formatRupiah(batch.canonical_closing_cash ?? 0)} emphasize />
      </dl>
      <p className="text-xs text-red-700 dark:text-red-400">
        Setiap nilai di atas akan dibalik melalui transaksi pembalik — nilai kas dan biaya operasional akan kembali ke
        kondisi sebelum batch ini dimasukkan.
      </p>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="batchId" value={batchId} />
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Alasan rollback (wajib diisi)
          <textarea
            name="reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Contoh: Rehearsal rollback import demo"
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
        </label>

        <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5"
          />
          <span>Saya memahami rollback akan membuat transaksi pembalik dan mencatatnya pada riwayat batch ini.</span>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !acknowledged || reason.trim().length === 0}
            className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Memproses..." : "Konfirmasi Rollback"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={pending}
            className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
        <FormError error={state.error} />
      </form>
    </section>
  );
}

function PreviewRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white/60 px-3 py-2 dark:bg-neutral-950/40">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`font-medium ${emphasize ? "text-red-700 dark:text-red-300" : ""}`}>{value}</dd>
    </div>
  );
}
