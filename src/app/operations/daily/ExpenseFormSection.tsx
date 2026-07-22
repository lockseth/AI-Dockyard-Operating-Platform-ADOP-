"use client";

import { useActionState } from "react";
import { createExpenseDraftAction } from "@/lib/operations-daily/actions";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    <Card>
      <h2 className="text-[20px] font-extrabold tracking-tight">2. Catat Biaya Kapal</h2>

      {!poolId ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
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
            <Button type="submit" variant="primary" loading={isPending}>
              {isPending ? "Menyimpan..." : "Simpan Draft"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
