"use client";

import { useActionState, useState } from "react";
import { transitionVesselProjectAction } from "@/lib/vessel-projects/actions";
import type { VesselProjectActionResult } from "@/lib/vessel-projects/service";
import type { VesselProjectLifecycleStatus } from "@/lib/vessel-projects/types";
import { getVesselProjectLifecycleStatusLabel } from "@/lib/vessel-projects/labels";
import type { FacilityLocationRow } from "@/lib/master-data/facility-locations/repository";
import { FormError } from "@/components/master-data/FormError";
import { selectClassName } from "@/components/master-data/fields";

const initialState: VesselProjectActionResult = {};

const NEXT_STATUS: Partial<Record<VesselProjectLifecycleStatus, VesselProjectLifecycleStatus>> = {
  draft: "active",
  active: "ready_to_close",
  ready_to_close: "closed",
};

export function LifecycleTransitionControl({
  projectId,
  currentStatus,
  facilityLocationId,
  facilityLocations,
}: {
  projectId: string;
  currentStatus: VesselProjectLifecycleStatus;
  facilityLocationId: string | null;
  facilityLocations: FacilityLocationRow[];
}) {
  const [state, formAction, isPending] = useActionState(transitionVesselProjectAction, initialState);
  const [selectedFacilityLocationId, setSelectedFacilityLocationId] = useState("");
  const nextStatus = NEXT_STATUS[currentStatus];

  if (!nextStatus) {
    return (
      <p className="text-xs text-neutral-500">
        Project sudah {getVesselProjectLifecycleStatusLabel(currentStatus).toLowerCase()} — tidak ada transisi lanjutan.
      </p>
    );
  }

  // "Lengkapi & Aktifkan" — a draft project missing its Facility Location
  // cannot activate until one is supplied (server-side, fail-closed:
  // DRAFT_ACTIVATION_MISSING_FACILITY_LOCATION). Completing and activating
  // happens in the same atomic RPC call, never a separate edit step.
  const needsCompletion = currentStatus === "draft" && facilityLocationId === null;

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <input type="hidden" name="id" value={projectId} />
      <input type="hidden" name="toStatus" value={nextStatus} />
      <p className="text-sm">
        {needsCompletion ? "Lengkapi Facility Location untuk mengaktifkan project ini" : "Ubah status menjadi"}{" "}
        <strong>{getVesselProjectLifecycleStatusLabel(nextStatus)}</strong>
      </p>
      {needsCompletion ? (
        <select
          name="facilityLocationId"
          required
          value={selectedFacilityLocationId}
          onChange={(event) => setSelectedFacilityLocationId(event.target.value)}
          aria-label="Facility Location"
          className={selectClassName}
        >
          <option value="">Pilih Facility Location...</option>
          {facilityLocations.map((facility) => (
            <option key={facility.id} value={facility.id}>
              {facility.name}
            </option>
          ))}
        </select>
      ) : null}
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
        disabled={isPending || (needsCompletion && !selectedFacilityLocationId)}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Memproses..." : needsCompletion ? "Lengkapi & Aktifkan" : `Ubah ke ${getVesselProjectLifecycleStatusLabel(nextStatus)}`}
      </button>
    </form>
  );
}
