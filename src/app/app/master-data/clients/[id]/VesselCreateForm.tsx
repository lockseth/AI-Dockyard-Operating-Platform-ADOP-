"use client";

import { useActionState } from "react";
import { createVesselAction } from "@/lib/master-data/vessels/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import { TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";

const initialState: MasterDataActionResult = {};

export function VesselCreateForm({ clientId }: { clientId: string }) {
  const [state, formAction, isPending] = useActionState(createVesselAction, initialState);
  const hasError = Boolean(state.error) || Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <CollapsibleCreatePanel label="Tambah Kapal" forceOpen={hasError} hasError={hasError}>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nama Kapal" name="vesselName" required errors={state.fieldErrors?.vesselName} />
          <TextField label="Kode Kapal (opsional)" name="vesselCode" errors={state.fieldErrors?.vesselCode} />
          <TextField
            label="Nomor Registrasi (opsional)"
            name="registrationNumber"
            errors={state.fieldErrors?.registrationNumber}
          />
          <TextField label="Tipe Kapal (opsional)" name="vesselType" errors={state.fieldErrors?.vesselType} />
        </div>
        <FormError error={state.error} />
        <div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
          >
            {isPending ? "Menyimpan..." : "Simpan Kapal"}
          </button>
        </div>
      </form>
    </CollapsibleCreatePanel>
  );
}
