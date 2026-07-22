import { CurrencyField, SelectField, TextAreaField, TextField } from "@/components/master-data/fields";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";
import type { ExpenseEntryScope } from "@/lib/expense-approvals/types";

export interface ExpenseFormDefaultValues {
  projectId?: string | null;
  categoryId?: string | null;
  vendorId?: string | null;
  facilityLocationId?: string | null;
  amount?: number | null;
  referenceNumber?: string | null;
  description?: string | null;
}

// Split in two so the unified "Tambah Transaksi" workspace (TransactionWorkspace.tsx)
// can present them as separate collapsible sections matching the approved
// prototype ("Informasi Utama" / "Alokasi Project"), while every existing
// caller (ExpenseFormSection, ExpenseSubmissionRow) keeps using the
// combined `ExpenseFormFields` below unchanged — same fields, same names,
// same validation either way.
export function ExpenseFormFieldsInfo({
  defaultValues,
  fieldErrors,
}: {
  defaultValues?: ExpenseFormDefaultValues;
  fieldErrors?: Record<string, string[]>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
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

// entryScope gates the Project Kapal field the same way the approved
// prototype does: "project" shows it (required), "shared_overhead" omits it
// entirely (project_id must stay null — record_shared_overhead_expense/
// create_expense_draft both reject a project on this scope). Facility
// Location is optional on both scopes and only rendered when the caller
// supplies facilityOptions, so existing callers that don't pass it keep
// their exact prior layout.
export function ExpenseFormFieldsAllocation({
  entryScope = "project",
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
  defaultValues,
  fieldErrors,
}: {
  entryScope?: ExpenseEntryScope;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions?: VesselProjectOption[];
  defaultValues?: ExpenseFormDefaultValues;
  fieldErrors?: Record<string, string[]>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {entryScope === "project" ? (
        <SelectField
          label="Project Kapal"
          name="projectId"
          options={projectOptions}
          defaultValue={defaultValues?.projectId}
          errors={fieldErrors?.projectId}
        />
      ) : null}
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
      {facilityOptions ? (
        <SelectField
          label="Facility Location (opsional)"
          name="facilityLocationId"
          options={facilityOptions}
          defaultValue={defaultValues?.facilityLocationId}
          errors={fieldErrors?.facilityLocationId}
        />
      ) : null}
    </div>
  );
}

export function ExpenseFormFields({
  entryScope = "project",
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
  defaultValues,
  fieldErrors,
}: {
  entryScope?: ExpenseEntryScope;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions?: VesselProjectOption[];
  defaultValues?: ExpenseFormDefaultValues;
  fieldErrors?: Record<string, string[]>;
}) {
  return (
    <>
      <ExpenseFormFieldsAllocation
        entryScope={entryScope}
        projectOptions={projectOptions}
        categoryOptions={categoryOptions}
        vendorOptions={vendorOptions}
        facilityOptions={facilityOptions}
        defaultValues={defaultValues}
        fieldErrors={fieldErrors}
      />
      <ExpenseFormFieldsInfo defaultValues={defaultValues} fieldErrors={fieldErrors} />
    </>
  );
}
