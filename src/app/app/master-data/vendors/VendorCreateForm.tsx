"use client";

import { useActionState } from "react";
import { createVendorAction } from "@/lib/master-data/vendors/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import { TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: MasterDataActionResult = {};

export function VendorCreateForm() {
  const [state, formAction, isPending] = useActionState(createVendorAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nama Vendor" name="displayName" required errors={state.fieldErrors?.displayName} />
        <TextField label="Kode Vendor (opsional)" name="vendorCode" errors={state.fieldErrors?.vendorCode} />
        <TextField label="Nama Kontak (opsional)" name="contactName" errors={state.fieldErrors?.contactName} />
        <TextField label="Email (opsional)" name="email" type="email" errors={state.fieldErrors?.email} />
        <TextField label="Telepon (opsional)" name="phone" errors={state.fieldErrors?.phone} />
      </div>
      <TextAreaField label="Alamat (opsional)" name="address" errors={state.fieldErrors?.address} />
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Menyimpan..." : "Simpan Vendor"}
        </button>
      </div>
    </form>
  );
}
