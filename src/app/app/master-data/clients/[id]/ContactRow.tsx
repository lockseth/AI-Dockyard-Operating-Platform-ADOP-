"use client";

import { useActionState, useState } from "react";
import {
  setClientContactStatusAction,
  updateClientContactAction,
} from "@/lib/master-data/client-contacts/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { ClientContactRow } from "@/lib/master-data/client-contacts/repository";
import { CheckboxField, SelectField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";

const initialState: MasterDataActionResult = {};

const CONTACT_ROLE_OPTIONS = [
  { value: "operational", label: "Operational" },
  { value: "billing", label: "Billing" },
  { value: "finance", label: "Finance" },
  { value: "approver", label: "Approver" },
  { value: "other", label: "Other" },
];

const CONTACT_ROLE_LABEL: Record<string, string> = {
  operational: "Operational",
  billing: "Billing",
  finance: "Finance",
  approver: "Approver",
  other: "Other",
};

export function ContactRow({
  contact,
  clientId,
  canMutate,
}: {
  contact: ClientContactRow;
  clientId: string;
  canMutate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateClientContactAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditing);

  if (!editing) {
    const details = [contact.position_department, contact.email, contact.whatsapp_number]
      .filter(Boolean)
      .join(" · ");
    const recipientChannels = [
      contact.receives_invoice_whatsapp ? "Invoice WhatsApp" : null,
      contact.receives_invoice_email ? "Invoice Email" : null,
      contact.receives_collection_reminder ? "Reminder Collection" : null,
    ].filter(Boolean);

    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div>
          <div className="font-medium">
            {contact.full_name}
            {contact.is_primary ? (
              <span className="ml-2 text-xs font-normal text-neutral-500">(Utama)</span>
            ) : null}
            {contact.role ? (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {CONTACT_ROLE_LABEL[contact.role] ?? contact.role}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-neutral-500">{details || "-"}</div>
          {recipientChannels.length > 0 ? (
            <div className="text-xs text-neutral-400">Penerima: {recipientChannels.join(", ")}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={contact.status} />
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
                id={contact.id}
                currentStatus={contact.status}
                action={setClientContactStatusAction}
                extraFields={{ clientId }}
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
        <input type="hidden" name="id" value={contact.id} />
        <input type="hidden" name="clientId" value={clientId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nama PIC"
            name="fullName"
            defaultValue={contact.full_name}
            required
            errors={state.fieldErrors?.fullName}
          />
          <TextField
            label="Jabatan / Departemen"
            name="positionDepartment"
            defaultValue={contact.position_department}
            errors={state.fieldErrors?.positionDepartment}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            defaultValue={contact.email}
            errors={state.fieldErrors?.email}
          />
          <TextField
            label="WhatsApp"
            name="whatsappNumber"
            defaultValue={contact.whatsapp_number}
            errors={state.fieldErrors?.whatsappNumber}
          />
          <SelectField
            label="Peran PIC"
            name="role"
            defaultValue={contact.role}
            options={CONTACT_ROLE_OPTIONS}
            errors={state.fieldErrors?.role}
          />
        </div>
        <CheckboxField label="PIC utama" name="isPrimary" defaultChecked={contact.is_primary} />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-neutral-500">Penerima</span>
          <CheckboxField
            label="Menerima invoice via WhatsApp"
            name="receivesInvoiceWhatsapp"
            defaultChecked={contact.receives_invoice_whatsapp}
          />
          <CheckboxField
            label="Menerima invoice via email"
            name="receivesInvoiceEmail"
            defaultChecked={contact.receives_invoice_email}
          />
          <CheckboxField
            label="Menerima reminder collection"
            name="receivesCollectionReminder"
            defaultChecked={contact.receives_collection_reminder}
          />
        </div>
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
