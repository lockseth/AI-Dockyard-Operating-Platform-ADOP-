"use client";

import { useActionState } from "react";
import { recordCashPoolEntryAction } from "@/lib/operations-daily/actions";
import { FieldError, FormError } from "@/components/master-data/FormError";
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
        className={inputClassName}
      />
      <FieldError messages={state.fieldErrors?.amount} />
      <input
        name="description"
        type="text"
        placeholder="Keterangan (opsional)"
        aria-label={`Keterangan ${label}`}
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
