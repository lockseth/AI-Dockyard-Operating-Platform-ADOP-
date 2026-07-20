"use client";

import { useActionState } from "react";
import { markCashImportBatchReadyForReviewAction } from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import { FormError } from "@/components/master-data/FormError";

const initialState: CashImportStagingActionResult = {};

export function ReadyForReviewControl({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const [state, formAction, isPending] = useActionState(markCashImportBatchReadyForReviewAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <button
        type="submit"
        disabled={isPending || disabled}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Memproses..." : "Siapkan untuk Review"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}
