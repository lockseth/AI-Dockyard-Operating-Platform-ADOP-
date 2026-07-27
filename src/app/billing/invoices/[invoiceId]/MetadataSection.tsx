"use client";

import { useActionState } from "react";
import { updateInvoiceBillingMetadataAction } from "@/lib/invoice-evidence/actions";
import type { InvoiceEvidenceActionResult } from "@/lib/invoice-evidence/service";
import type { InvoiceStatus } from "@/lib/invoice-evidence/types";
import { SelectField, TextField } from "@/components/master-data/fields";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/master-data/FormError";

const initialState: InvoiceEvidenceActionResult = {};

export interface LegalEntityOption {
  id: string;
  displayName: string;
}

// Phase 2A Contract §6.1/§7/§10.2 (Gate 4E) — draft-only form: legal
// entity/invoice number/dates are frozen by the database the instant status
// leaves `draft` (invoices_enforce_metadata_locked trigger), so this section
// renders nothing outside draft rather than showing disabled controls.
export function MetadataSection({
  invoiceId,
  invoiceStatus,
  legalEntityId,
  invoiceNumber,
  invoiceDate,
  dueDate,
  legalEntityOptions,
}: {
  invoiceId: string;
  invoiceStatus: InvoiceStatus | null;
  legalEntityId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  legalEntityOptions: LegalEntityOption[];
}) {
  const [state, formAction, isPending] = useActionState(updateInvoiceBillingMetadataAction, initialState);

  if (invoiceStatus !== "draft") {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500">Metadata Invoice</h2>
      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Legal Entity"
            name="legalEntityId"
            defaultValue={legalEntityId ?? undefined}
            options={legalEntityOptions.map((entity) => ({ value: entity.id, label: entity.displayName }))}
            errors={state.fieldErrors?.legalEntityId}
          />
          <TextField
            label="Nomor Invoice"
            name="invoiceNumber"
            defaultValue={invoiceNumber ?? undefined}
            required
            errors={state.fieldErrors?.invoiceNumber}
          />
          <TextField
            label="Tanggal Invoice"
            name="invoiceDate"
            type="date"
            defaultValue={invoiceDate ?? undefined}
            required
            errors={state.fieldErrors?.invoiceDate}
          />
          <TextField
            label="Tanggal Jatuh Tempo"
            name="dueDate"
            type="date"
            defaultValue={dueDate ?? undefined}
            required
            errors={state.fieldErrors?.dueDate}
          />
        </div>
        <FormError error={state.error} />
        <Button type="submit" loading={isPending} size="md" className="self-start">
          {isPending ? "Menyimpan..." : "Simpan Metadata"}
        </Button>
      </form>
    </section>
  );
}
