import { CurrencyField, SelectField, TextAreaField, TextField } from "@/components/master-data/fields";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

export interface ExpenseFormDefaultValues {
  projectId?: string | null;
  categoryId?: string | null;
  vendorId?: string | null;
  amount?: number | null;
  referenceNumber?: string | null;
  description?: string | null;
}

export function ExpenseFormFields({
  projectOptions,
  categoryOptions,
  vendorOptions,
  defaultValues,
  fieldErrors,
}: {
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  defaultValues?: ExpenseFormDefaultValues;
  fieldErrors?: Record<string, string[]>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Project Kapal"
          name="projectId"
          options={projectOptions}
          defaultValue={defaultValues?.projectId}
          errors={fieldErrors?.projectId}
        />
        <SelectField
          label="Kategori Biaya"
          name="categoryId"
          options={categoryOptions}
          defaultValue={defaultValues?.categoryId}
          errors={fieldErrors?.categoryId}
        />
        <SelectField
          label="Vendor (opsional)"
          name="vendorId"
          options={vendorOptions}
          defaultValue={defaultValues?.vendorId}
          errors={fieldErrors?.vendorId}
        />
        <CurrencyField
          label="Nominal"
          name="amount"
          required
          defaultValue={defaultValues?.amount}
          errors={fieldErrors?.amount}
        />
        <TextField
          label="Referensi (opsional)"
          name="referenceNumber"
          defaultValue={defaultValues?.referenceNumber}
          errors={fieldErrors?.referenceNumber}
        />
      </div>
      <TextAreaField
        label="Deskripsi"
        name="description"
        defaultValue={defaultValues?.description}
        errors={fieldErrors?.description}
      />
    </>
  );
}
