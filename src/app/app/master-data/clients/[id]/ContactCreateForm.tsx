"use client";

import { useActionState } from "react";
import { createClientContactAction } from "@/lib/master-data/client-contacts/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import { CheckboxField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: MasterDataActionResult = {};

export function ContactCreateForm({ clientId }: { clientId: string }) {
  const [state, formAction, isPending] = useActionState(createClientContactAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Nama PIC" name="fullName" required errors={state.fieldErrors?.fullName} />
        <TextField
          label="Jabatan / Departemen (opsional)"
          name="positionDepartment"
          errors={state.fieldErrors?.positionDepartment}
        />
        <TextField label="Email (opsional)" name="email" type="email" errors={state.fieldErrors?.email} />
        <TextField
          label="WhatsApp (opsional)"
          name="whatsappNumber"
          errors={state.fieldErrors?.whatsappNumber}
        />
      </div>
      <CheckboxField label="Jadikan PIC utama" name="isPrimary" />
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Menyimpan..." : "Simpan PIC"}
        </button>
      </div>
    </form>
  );
}
