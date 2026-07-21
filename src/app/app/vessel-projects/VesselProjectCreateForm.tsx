"use client";

import { useActionState } from "react";
import { createVesselProjectAction } from "@/lib/vessel-projects/actions";
import type { CreateVesselProjectResult } from "@/lib/vessel-projects/service";
import { SelectField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: CreateVesselProjectResult = {};

const PRIORITY_OPTIONS = [
  { value: "emergency", label: "Emergency" },
  { value: "standard", label: "Standard" },
  { value: "urgent", label: "Urgent" },
];

export function VesselProjectCreateForm({
  vesselOptions,
  clientOptions,
  serviceTypeOptions,
  facilityLocationOptions,
}: {
  vesselOptions: Array<{ value: string; label: string }>;
  clientOptions: Array<{ value: string; label: string }>;
  serviceTypeOptions: Array<{ value: string; label: string }>;
  facilityLocationOptions: Array<{ value: string; label: string }>;
}) {
  const [state, formAction, isPending] = useActionState(createVesselProjectAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Kapal" name="vesselId" options={vesselOptions} errors={state.fieldErrors?.vesselId} />
        <SelectField label="Client" name="clientId" options={clientOptions} errors={state.fieldErrors?.clientId} />
        <SelectField
          label="Service Type"
          name="serviceTypeId"
          options={serviceTypeOptions}
          errors={state.fieldErrors?.serviceTypeId}
        />
        <SelectField
          label="Facility Location (opsional)"
          name="facilityLocationId"
          options={facilityLocationOptions}
          errors={state.fieldErrors?.facilityLocationId}
        />
        <SelectField
          label="Priority"
          name="priority"
          defaultValue="standard"
          options={PRIORITY_OPTIONS}
          errors={state.fieldErrors?.priority}
        />
        <TextField label="Kode Project (opsional)" name="projectCode" errors={state.fieldErrors?.projectCode} />
        <TextField label="Tanggal Mulai" name="startDate" type="date" required errors={state.fieldErrors?.startDate} />
      </div>
      <FormError error={state.error} />
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Menyimpan..." : "Simpan Project Kapal"}
      </button>
    </form>
  );
}
