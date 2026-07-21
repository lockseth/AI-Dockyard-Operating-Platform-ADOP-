"use client";

import { useActionState, useState } from "react";
import { recordCashPoolEntryAction } from "@/lib/operations-daily/actions";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import type { CashPoolEntryType } from "@/lib/cash-pool/types";
import type { RecordCashPoolEntryResult } from "@/lib/cash-pool/service";

const initialState: RecordCashPoolEntryResult = {};

const inputClassName =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:opacity-60 dark:border-neutral-700";

export function CashEntryForm({
  poolId,
  entryType,
  label,
  disabled,
  businessDate,
}: {
  poolId: string;
  entryType: CashPoolEntryType;
  label: string;
  disabled: boolean;
  // Only meaningful for entryType === "opening_cash" — every other entry
  // type keeps the original single-step submit, unchanged by this revision.
  businessDate?: string;
}) {
  // No hook is called in this component itself (in either branch) — each
  // branch fully delegates to a leaf component that owns its own
  // useActionState, so entryType switching between renders can never
  // violate the rules of hooks.
  if (entryType === "opening_cash") {
    return <OpeningCashEntryForm poolId={poolId} label={label} disabled={disabled} businessDate={businessDate} />;
  }
  return <StandardCashEntryForm poolId={poolId} entryType={entryType} label={label} disabled={disabled} />;
}

function StandardCashEntryForm({
  poolId,
  entryType,
  label,
  disabled,
}: {
  poolId: string;
  entryType: CashPoolEntryType;
  label: string;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(recordCashPoolEntryAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
    >
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="entryType" value={entryType} />
      <span className="text-sm font-medium">{label}</span>
      <input
        name="amount"
        type="number"
        min="1"
        step="1"
        required
        placeholder="Nominal (Rp)"
        aria-label={`Nominal ${label}`}
        disabled={disabled}
        className={inputClassName}
      />
      <FieldError messages={state.fieldErrors?.amount} />
      <input
        name="description"
        type="text"
        placeholder="Keterangan (opsional)"
        aria-label={`Keterangan ${label}`}
        disabled={disabled}
        className={inputClassName}
      />
      <FormError error={state.error} />
      <button
        type="submit"
        disabled={disabled || isPending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Menyimpan..." : "Simpan"}
      </button>
    </form>
  );
}

// Saldo awal is append-only and cannot be corrected except via reversal
// (LOCK C.1-C.4), so it gets its own explicit two-step flow: fill the
// amount, review a confirmation summary (date, nominal, append-only
// warning), then submit. The <form> that actually calls the server action
// only exists in the confirm step — nothing posts before that.
function OpeningCashEntryForm({
  poolId,
  label,
  disabled,
  businessDate,
}: {
  poolId: string;
  label: string;
  disabled: boolean;
  businessDate?: string;
}) {
  const [state, formAction, isPending] = useActionState(recordCashPoolEntryAction, initialState);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const parsedAmount = Number(amount);
  const canReview = amount.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;

  if (showConfirm) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30">
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Konfirmasi Saldo Awal</span>
        <dl className="flex flex-col gap-1 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex justify-between gap-2">
            <dt>Tanggal Operasional</dt>
            <dd className="font-medium">{businessDate ? formatBusinessDateLabel(businessDate) : "-"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Nominal</dt>
            <dd className="font-medium">{formatRupiah(parsedAmount)}</dd>
          </div>
        </dl>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Setelah dikonfirmasi, saldo awal ini menjadi transaksi append-only — tidak dapat diedit atau dihapus.
          Koreksi hanya dapat dilakukan melalui reversal di Riwayat Transaksi.
        </p>
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="poolId" value={poolId} />
          <input type="hidden" name="entryType" value="opening_cash" />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="description" value={description} />
          <FormError error={state.error} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-amber-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {isPending ? "Memposting..." : "Konfirmasi & Posting"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Batal
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="number"
        min="1"
        step="1"
        required
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        placeholder="Nominal (Rp)"
        aria-label={`Nominal ${label}`}
        disabled={disabled}
        className={inputClassName}
      />
      <input
        type="text"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Keterangan (opsional)"
        aria-label={`Keterangan ${label}`}
        disabled={disabled}
        className={inputClassName}
      />
      <button
        type="button"
        disabled={disabled || !canReview}
        onClick={() => setShowConfirm(true)}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        Tinjau & Konfirmasi
      </button>
    </div>
  );
}
