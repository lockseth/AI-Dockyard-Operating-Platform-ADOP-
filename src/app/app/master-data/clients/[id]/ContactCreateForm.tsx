"use client";

import { useActionState } from "react";
import { createClientContactAction } from "@/lib/master-data/client-contacts/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import { CheckboxField, SelectField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { Disclosure } from "@/components/ui/Disclosure";

const initialState: MasterDataActionResult = {};

const CONTACT_ROLE_OPTIONS = [
  { value: "operational", label: "Operational" },
  { value: "billing", label: "Billing" },
  { value: "finance", label: "Finance" },
  { value: "approver", label: "Approver" },
  { value: "other", label: "Other" },
];

export function ContactCreateForm({ clientId }: { clientId: string }) {
  const [state, formAction, isPending] = useActionState(createClientContactAction, initialState);
  const hasError = Boolean(state.error) || Object.keys(state.fieldErrors ?? {}).length > 0;

  return (
    <Disclosure title="Tambah PIC" defaultOpen={false} forceOpen={hasError} hasError={hasError}>
      <form action={formAction} className="flex flex-col gap-3">
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
          <SelectField label="Peran PIC (opsional)" name="role" options={CONTACT_ROLE_OPTIONS} errors={state.fieldErrors?.role} />
        </div>
        <CheckboxField label="Jadikan PIC utama" name="isPrimary" />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-neutral-500">Penerima</span>
          <CheckboxField label="Menerima invoice via WhatsApp" name="receivesInvoiceWhatsapp" />
          <CheckboxField label="Menerima invoice via email" name="receivesInvoiceEmail" />
          <CheckboxField label="Menerima reminder collection" name="receivesCollectionReminder" />
        </div>
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
    </Disclosure>
  );
}
