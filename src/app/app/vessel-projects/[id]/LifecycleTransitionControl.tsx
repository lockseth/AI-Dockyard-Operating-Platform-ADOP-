"use client";

import { useActionState } from "react";
import { transitionVesselProjectAction } from "@/lib/vessel-projects/actions";
import type { VesselProjectActionResult } from "@/lib/vessel-projects/service";
import type { VesselProjectLifecycleStatus } from "@/lib/vessel-projects/types";
import { getVesselProjectLifecycleStatusLabel } from "@/lib/vessel-projects/labels";
import { FormError } from "@/components/master-data/FormError";

const initialState: VesselProjectActionResult = {};

const NEXT_STATUS: Partial<Record<VesselProjectLifecycleStatus, VesselProjectLifecycleStatus>> = {
  active: "ready_to_close",
  ready_to_close: "closed",
};

export function LifecycleTransitionControl({
  projectId,
  currentStatus,
}: {
  projectId: string;
  currentStatus: VesselProjectLifecycleStatus;
}) {
  const [state, formAction, isPending] = useActionState(transitionVesselProjectAction, initialState);
  const nextStatus = NEXT_STATUS[currentStatus];

  if (!nextStatus) {
    return (
      <p className="text-xs text-neutral-500">
        Project sudah {getVesselProjectLifecycleStatusLabel(currentStatus).toLowerCase()} — tidak ada transisi lanjutan.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <input type="hidden" name="id" value={projectId} />
      <input type="hidden" name="toStatus" value={nextStatus} />
      <p className="text-sm">
        Ubah status menjadi <strong>{getVesselProjectLifecycleStatusLabel(nextStatus)}</strong>
      </p>
      <textarea
        name="reason"
        rows={2}
        placeholder="Alasan (opsional)"
        aria-label="Alasan transisi"
        className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700"
      />
      <FormError error={state.error} />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Memproses..." : `Ubah ke ${getVesselProjectLifecycleStatusLabel(nextStatus)}`}
      </button>
    </form>
  );
}
