"use client";

import { useActionState } from "react";
import { createFacilityLocationAction } from "@/lib/master-data/facility-locations/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import { TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: MasterDataActionResult = {};

export function FacilityLocationCreateForm() {
  const [state, formAction, isPending] = useActionState(createFacilityLocationAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama Lokasi" name="name" required errors={state.fieldErrors?.name} />
        <TextField label="Kode (opsional)" name="code" errors={state.fieldErrors?.code} />
      </div>
      <TextAreaField label="Deskripsi (opsional)" name="description" errors={state.fieldErrors?.description} />
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Menyimpan..." : "Simpan Lokasi"}
        </button>
      </div>
    </form>
  );
}
