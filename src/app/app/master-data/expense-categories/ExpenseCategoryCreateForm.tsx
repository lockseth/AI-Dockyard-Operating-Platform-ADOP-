"use client";

import { useActionState } from "react";
import { createExpenseCategoryAction } from "@/lib/master-data/expense-categories/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { ExpenseCategoryRow } from "@/lib/master-data/expense-categories/repository";
import { SelectField, TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";

const initialState: MasterDataActionResult = {};

export function ExpenseCategoryCreateForm({ categories }: { categories: ExpenseCategoryRow[] }) {
  const [state, formAction, isPending] = useActionState(createExpenseCategoryAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Kode" name="code" required errors={state.fieldErrors?.code} />
        <TextField label="Nama" name="name" required errors={state.fieldErrors?.name} />
        <SelectField
          label="Kategori Induk (opsional)"
          name="parentId"
          options={categories.map((category) => ({ value: category.id, label: `${category.code} — ${category.name}` }))}
          errors={state.fieldErrors?.parentId}
        />
      </div>
      <TextAreaField label="Deskripsi (opsional)" name="description" errors={state.fieldErrors?.description} />
      <FormError error={state.error} />
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {isPending ? "Menyimpan..." : "Simpan Kategori"}
        </button>
      </div>
    </form>
  );
}
