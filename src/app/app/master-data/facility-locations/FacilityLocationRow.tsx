"use client";

import { useActionState, useState } from "react";
import {
  setFacilityLocationStatusAction,
  updateFacilityLocationAction,
} from "@/lib/master-data/facility-locations/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { FacilityLocationRow as FacilityLocationRowData } from "@/lib/master-data/facility-locations/repository";
import { TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";

const initialState: MasterDataActionResult = {};

export function FacilityLocationRow({
  location,
  canMutate,
}: {
  location: FacilityLocationRowData;
  canMutate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateFacilityLocationAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditing);

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div>
          <div className="font-medium">
            {location.name}
            {location.code ? <span className="ml-2 text-xs font-normal text-neutral-500">({location.code})</span> : null}
          </div>
          <div className="text-xs text-neutral-500">{location.description || "-"}</div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={location.status} />
          {canMutate ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Edit
              </button>
              <StatusToggleForm
                id={location.id}
                currentStatus={location.status}
                action={setFacilityLocationStatusAction}
              />
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={location.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nama Lokasi" name="name" defaultValue={location.name} required errors={state.fieldErrors?.name} />
          <TextField label="Kode" name="code" defaultValue={location.code} errors={state.fieldErrors?.code} />
        </div>
        <TextAreaField
          label="Deskripsi"
          name="description"
          defaultValue={location.description}
          errors={state.fieldErrors?.description}
        />
        <FormError error={state.error} />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
          >
            Batal
          </button>
        </div>
      </form>
    </li>
  );
}
