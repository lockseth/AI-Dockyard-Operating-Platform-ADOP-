"use client";

import { useActionState, useState } from "react";
import { setVendorStatusAction, updateVendorAction } from "@/lib/master-data/vendors/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { VendorRow as VendorRowData } from "@/lib/master-data/vendors/repository";
import { TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";

const initialState: MasterDataActionResult = {};

export function VendorRow({ vendor, canMutate }: { vendor: VendorRowData; canMutate: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateVendorAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditing);

  if (!editing) {
    const details = [vendor.vendor_code, vendor.contact_name, vendor.email, vendor.phone]
      .filter(Boolean)
      .join(" · ");

    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div>
          <div className="font-medium">{vendor.display_name}</div>
          <div className="text-xs text-neutral-500">{details || "-"}</div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={vendor.status} />
          {canMutate ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-neutral-600 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Edit
              </button>
              <StatusToggleForm id={vendor.id} currentStatus={vendor.status} action={setVendorStatusAction} />
            </>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={vendor.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nama Vendor"
            name="displayName"
            defaultValue={vendor.display_name}
            required
            errors={state.fieldErrors?.displayName}
          />
          <TextField
            label="Kode Vendor"
            name="vendorCode"
            defaultValue={vendor.vendor_code}
            errors={state.fieldErrors?.vendorCode}
          />
          <TextField
            label="Nama Kontak"
            name="contactName"
            defaultValue={vendor.contact_name}
            errors={state.fieldErrors?.contactName}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={vendor.email}
            errors={state.fieldErrors?.email}
          />
          <TextField label="Telepon" name="phone" defaultValue={vendor.phone} errors={state.fieldErrors?.phone} />
        </div>
        <TextAreaField
          label="Alamat"
          name="address"
          defaultValue={vendor.address}
          errors={state.fieldErrors?.address}
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
