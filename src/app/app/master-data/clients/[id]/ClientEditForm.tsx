"use client";

import { useActionState } from "react";
import { updateClientAction } from "@/lib/master-data/clients/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import { NumericField, SelectField, TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: MasterDataActionResult = {};

const INVOICE_DELIVERY_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "both", label: "WhatsApp & Email" },
];

export function ClientEditForm({ client }: { client: ClientRow }) {
  const [state, formAction, isPending] = useActionState(updateClientAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <input type="hidden" name="id" value={client.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nama Client"
          name="displayName"
          defaultValue={client.display_name}
          required
          errors={state.fieldErrors?.displayName}
        />
        <TextField
          label="Kode Client (opsional)"
          name="clientCode"
          defaultValue={client.client_code}
          errors={state.fieldErrors?.clientCode}
        />
        <TextField
          label="Nama Legal (opsional)"
          name="legalName"
          defaultValue={client.legal_name}
          errors={state.fieldErrors?.legalName}
        />
        <TextField
          label="NPWP / Tax ID (opsional)"
          name="taxIdentifier"
          defaultValue={client.tax_identifier}
          errors={state.fieldErrors?.taxIdentifier}
        />
        <NumericField
          label="Jangka Waktu Pembayaran Default (hari, opsional)"
          name="defaultPaymentTermDays"
          defaultValue={client.default_payment_term_days}
          errors={state.fieldErrors?.defaultPaymentTermDays}
        />
        <SelectField
          label="Preferensi Pengiriman Invoice (opsional)"
          name="invoiceDeliveryPreference"
          defaultValue={client.invoice_delivery_preference}
          options={INVOICE_DELIVERY_OPTIONS}
          errors={state.fieldErrors?.invoiceDeliveryPreference}
        />
      </div>
      <TextAreaField
        label="Alamat / Billing Address (opsional)"
        name="address"
        defaultValue={client.address}
        errors={state.fieldErrors?.address}
      />
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}
