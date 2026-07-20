"use client";

import { useActionState } from "react";
import { createExpenseDraftAction } from "@/lib/operations-daily/actions";
import { FormError } from "@/components/master-data/FormError";
import { ExpenseFormFields } from "./ExpenseFormFields";
import type { ExpenseSubmissionActionResult } from "@/lib/expense-approvals/service";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

const initialState: ExpenseSubmissionActionResult = {};

export function ExpenseFormSection({
  poolId,
  projectOptions,
  categoryOptions,
  vendorOptions,
}: {
  poolId: string | null;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
}) {
  const [state, formAction, isPending] = useActionState(createExpenseDraftAction, initialState);

  return (
    <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">2. Catat Biaya Kapal</h2>

      {!poolId ? (
        <p className="mt-2 text-sm text-neutral-500">
          Buka kas hari ini terlebih dahulu sebelum mencatat biaya kapal.
        </p>
      ) : (
        <form action={formAction} className="mt-4 flex flex-col gap-4" key={state.submission?.id}>
          <input type="hidden" name="poolId" value={poolId} />
          <ExpenseFormFields
            projectOptions={projectOptions}
            categoryOptions={categoryOptions}
            vendorOptions={vendorOptions}
            fieldErrors={state.fieldErrors}
          />
          <FormError error={state.error} />
          <div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {isPending ? "Menyimpan..." : "Simpan Draft"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
