"use client";

import { useActionState } from "react";
import {
  autoApplyCashImportBatchDispositionsAction,
  type AutoApplyCashImportBatchDispositionsActionResult,
} from "@/lib/cash-import-staging/actions";
import { FormError } from "@/components/master-data/FormError";

const initialState: AutoApplyCashImportBatchDispositionsActionResult = {};

// Whole-batch bulk action — sets disposition for every currently-undecided
// row across every label in one call. Per-label scoping ("Terapkan Otomatis
// ke Baris Label Ini") lives in LabelMappingControl, using the same action
// with scopeToLabel=true.
export function AutoApplyControl({ batchId }: { batchId: string }) {
  const [state, formAction, isPending] = useActionState(autoApplyCashImportBatchDispositionsAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
    >
      <input type="hidden" name="batchId" value={batchId} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Memproses..." : "Terapkan Otomatis ke Semua Baris Valid"}
      </button>
      {state.result ? (
        <p className="text-xs text-neutral-500">
          {state.result.auto_included_count ?? 0} baris otomatis di-include, {state.result.manual_review_count ?? 0}{" "}
          baris perlu tinjauan manual.
        </p>
      ) : null}
      <FormError error={state.error} />
    </form>
  );
}
