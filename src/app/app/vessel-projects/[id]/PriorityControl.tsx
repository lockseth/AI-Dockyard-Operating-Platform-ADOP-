"use client";

import { useActionState } from "react";
import { setVesselProjectPriorityAction } from "@/lib/vessel-projects/actions";
import type { VesselProjectActionResult } from "@/lib/vessel-projects/service";
import type { VesselProjectPriority } from "@/lib/vessel-projects/types";
import { SelectField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: VesselProjectActionResult = {};

const PRIORITY_OPTIONS = [
  { value: "emergency", label: "Emergency" },
  { value: "standard", label: "Standard" },
  { value: "urgent", label: "Urgent" },
];

export function PriorityControl({ projectId, currentPriority }: { projectId: string; currentPriority: VesselProjectPriority }) {
  const [state, formAction, isPending] = useActionState(setVesselProjectPriorityAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <input type="hidden" name="id" value={projectId} />
      <SelectField
        label="Priority"
        name="priority"
        defaultValue={currentPriority}
        options={PRIORITY_OPTIONS}
        errors={state.fieldErrors?.priority}
      />
      <FormError error={state.error} />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Menyimpan..." : "Simpan Priority"}
      </button>
    </form>
  );
}
