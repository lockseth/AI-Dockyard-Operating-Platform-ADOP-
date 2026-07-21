"use client";

import { useActionState, useState } from "react";
import { reverseCashPoolEntryAction } from "@/lib/cash-pool/actions";
import { reverseProjectExpenseAction } from "@/lib/cost-ledger/actions";
import { reversePairedProjectRefundAction } from "@/lib/paired-refund-reversal/actions";
import { formatRupiah } from "@/lib/operations-daily/format";
import { FormError } from "@/components/master-data/FormError";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";
import type { TenantRole } from "@/lib/auth/tenant";

type ReversalKind = "cash_pool" | "cost_ledger" | "paired_refund" | null;

function getReversalKind(transactionType: string | null): ReversalKind {
  switch (transactionType) {
    case "opening_cash":
    case "cash_top_up":
    case "other_cash_in":
      return "cash_pool";
    case "project_expense":
    case "shared_overhead_expense":
      return "cost_ledger";
    case "project_refund":
      return "paired_refund";
    default:
      return null;
  }
}

// Routes to whichever of the three reversal mutations actually owns this
// transaction's ledger row(s) — a plain cash_pool_entries row, a plain
// project_cost_ledger_entries row, or a paired cash+cost project_refund
// (which requires the atomic two-legged reverse_paired_project_refund RPC,
// never the single-sided ones). No new RPC is introduced here; this only
// wires the UI to the three that already exist.
export function ReversalControl({
  transaction,
  viewerRoles,
}: {
  transaction: TrustedTransactionRow;
  viewerRoles: TenantRole[];
}) {
  const kind = getReversalKind(transaction.transaction_type);

  // Hiding the button is a UX nicety, not the authorization boundary — every
  // *ForActiveTenant service function re-checks the role server-side
  // regardless of what this component renders. paired_refund is owner-only
  // (reversePairedProjectRefundForActiveTenant); cash_pool/cost_ledger admit
  // owner+admin (reverseCashPoolEntryForActiveTenant/
  // reverseProjectExpenseForActiveTenant) — matching each service's own
  // requireTenantRole call exactly.
  const allowedRoles = kind === "paired_refund" ? (["owner"] as const) : (["owner", "admin"] as const);
  const canReverse = viewerRoles.some((role) => (allowedRoles as readonly TenantRole[]).includes(role));

  if (!kind || !canReverse) {
    return null;
  }

  // Only an active, original (non-reversal, non-partially-reversed) row can
  // be reversed — matches every RPC's own "entry_kind = 'entry'"/"status
  // must be active" guard, this is the UI-side reflection of it.
  if (transaction.status !== "active") {
    return (
      <p className="text-xs text-neutral-500">
        {transaction.status === "reversed"
          ? "Transaksi ini sudah direversal sebelumnya — tidak dapat direversal ulang."
          : transaction.status === "reversal"
            ? "Ini adalah transaksi reversal — tidak dapat direversal lagi."
            : "Transaksi ini tidak dapat direversal langsung dari halaman ini."}
      </p>
    );
  }

  if (kind === "paired_refund") {
    if (!transaction.cash_entry_id || !transaction.cost_entry_id) {
      return null;
    }
    return (
      <PairedRefundReversalForm
        cashEntryId={transaction.cash_entry_id}
        costEntryId={transaction.cost_entry_id}
        amount={transaction.display_amount}
      />
    );
  }

  const entryId = kind === "cash_pool" ? transaction.cash_entry_id : transaction.cost_entry_id;
  if (!entryId) {
    return null;
  }

  return (
    <SingleEntryReversalForm
      action={kind === "cash_pool" ? reverseCashPoolEntryAction : reverseProjectExpenseAction}
      entryId={entryId}
      amount={transaction.display_amount}
    />
  );
}

interface ReversalActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const initialSingleState: ReversalActionResult = {};

function SingleEntryReversalForm({
  action,
  entryId,
  amount,
}: {
  action: (prevState: ReversalActionResult, formData: FormData) => Promise<ReversalActionResult>;
  entryId: string;
  amount: number | null;
}) {
  const [state, formAction, isPending] = useActionState(action, initialSingleState);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
      >
        Koreksi via Reversal
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-red-300 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/30">
      <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Konfirmasi Reversal</h3>
      <p className="text-xs text-red-800 dark:text-red-300">
        Nilai yang akan dibalik: <strong>{formatRupiah(amount)}</strong>. ADOP akan membuat transaksi pembalik
        terpisah — transaksi asli tidak diedit atau dihapus.
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="entryId" value={entryId} />
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Alasan koreksi (wajib diisi)
          <textarea
            name="reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
        </label>
        <FormError error={state.error} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || reason.trim().length === 0}
            className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Memproses..." : "Konfirmasi Reversal"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
      </form>
    </section>
  );
}

function PairedRefundReversalForm({
  cashEntryId,
  costEntryId,
  amount,
}: {
  cashEntryId: string;
  costEntryId: string;
  amount: number | null;
}) {
  const [state, formAction, isPending] = useActionState(reversePairedProjectRefundAction, {});
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-300"
      >
        Koreksi via Reversal
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-red-300 bg-red-50/60 p-4 dark:border-red-800 dark:bg-red-950/30">
      <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Konfirmasi Reversal Refund Project</h3>
      <p className="text-xs text-red-800 dark:text-red-300">
        Nilai yang akan dibalik: <strong>{formatRupiah(amount)}</strong>. Ini adalah refund berpasangan — kedua sisi
        ledger (kas dan biaya proyek) dibalik atomik dalam satu transaksi pembalik; transaksi asli tidak diedit atau
        dihapus.
      </p>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="cashEntryId" value={cashEntryId} />
        <input type="hidden" name="costEntryId" value={costEntryId} />
        <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
          Alasan koreksi (wajib diisi)
          <textarea
            name="reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
        </label>
        <FormError error={state.error} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending || reason.trim().length === 0}
            className="w-fit rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isPending ? "Memproses..." : "Konfirmasi Reversal"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isPending}
            className="w-fit rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
      </form>
    </section>
  );
}
