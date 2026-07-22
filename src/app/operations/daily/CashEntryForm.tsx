"use client";

import { useActionState, useState } from "react";
import { recordCashPoolEntryAction } from "@/lib/operations-daily/actions";
import { FieldError, FormError } from "@/components/master-data/FormError";
import { inputClassName } from "@/components/master-data/fields";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import type { CashPoolEntryType } from "@/lib/cash-pool/types";
import type { RecordCashPoolEntryResult } from "@/lib/cash-pool/service";

const initialState: RecordCashPoolEntryResult = {};

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

export function StandardCashEntryForm({
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
      <Button type="submit" variant="primary" size="sm" disabled={disabled} loading={isPending}>
        {isPending ? "Menyimpan..." : "Simpan"}
      </Button>
    </form>
  );
}

// Saldo awal is append-only and cannot be corrected except via reversal
// (LOCK C.1-C.4), so it gets its own explicit two-step flow: fill the
// amount, review a confirmation summary (date, nominal, append-only
// warning), then submit. The <form> that actually calls the server action
// only exists in the confirm step — nothing posts before that.
export function OpeningCashEntryForm({
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
      <Callout tone="warning" title="Konfirmasi Saldo Awal" className="flex flex-col gap-3">
        <dl className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt>Tanggal Operasional</dt>
            <dd className="font-medium">{businessDate ? formatBusinessDateLabel(businessDate) : "-"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Nominal</dt>
            <dd className="font-medium">{formatRupiah(parsedAmount)}</dd>
          </div>
        </dl>
        <p className="text-xs">
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
            <Button type="submit" variant="brand" size="sm" loading={isPending}>
              {isPending ? "Memposting..." : "Konfirmasi & Posting"}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => setShowConfirm(false)}>
              Batal
            </Button>
          </div>
        </form>
      </Callout>
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
      <Button type="button" variant="primary" size="sm" disabled={disabled || !canReview} onClick={() => setShowConfirm(true)}>
        Tinjau & Konfirmasi
      </Button>
    </div>
  );
}
