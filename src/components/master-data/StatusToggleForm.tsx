"use client";

import { useActionState } from "react";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { RecordStatus } from "@/lib/master-data/shared/types";
import { FormError } from "./FormError";

type StatusAction = (
  prevState: MasterDataActionResult,
  formData: FormData,
) => Promise<MasterDataActionResult>;

const initialState: MasterDataActionResult = {};

// Generic across every master-data domain — each domain's setXStatusAction
// has the same (id, status[, extra hidden fields]) shape.
export function StatusToggleForm({
  id,
  currentStatus,
  action,
  extraFields,
}: {
  id: string;
  currentStatus: RecordStatus;
  action: StatusAction;
  extraFields?: Record<string, string>;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const nextStatus: RecordStatus = currentStatus === "active" ? "inactive" : "active";

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={nextStatus} />
      {extraFields
        ? Object.entries(extraFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <button
        type="submit"
        disabled={isPending}
        className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        {isPending ? "Memproses..." : nextStatus === "inactive" ? "Nonaktifkan" : "Aktifkan"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}
