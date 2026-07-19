"use client";

import { useActionState, useState } from "react";
import {
  setExpenseCategoryStatusAction,
  updateExpenseCategoryAction,
} from "@/lib/master-data/expense-categories/actions";
import type { MasterDataActionResult } from "@/lib/master-data/clients/service";
import type { ExpenseCategoryRow as ExpenseCategoryRowData } from "@/lib/master-data/expense-categories/repository";
import { TextAreaField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { useCloseEditOnSuccess } from "@/components/master-data/useCloseEditOnSuccess";

const initialState: MasterDataActionResult = {};

export function ExpenseCategoryRow({
  category,
  parentName,
  canMutate,
}: {
  category: ExpenseCategoryRowData;
  parentName: string | null;
  canMutate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateExpenseCategoryAction, initialState);
  useCloseEditOnSuccess(state, initialState, setEditing);

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
        <div>
          <div className="font-medium">
            {category.name} <span className="text-xs font-normal text-neutral-500">({category.code})</span>
          </div>
          <div className="text-xs text-neutral-500">
            {parentName ? `Induk: ${parentName}` : "Kategori utama"}
            {category.description ? ` · ${category.description}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={category.status} />
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
                id={category.id}
                currentStatus={category.status}
                action={setExpenseCategoryStatusAction}
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
        <input type="hidden" name="id" value={category.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Kode" name="code" defaultValue={category.code} required errors={state.fieldErrors?.code} />
          <TextField label="Nama" name="name" defaultValue={category.name} required errors={state.fieldErrors?.name} />
        </div>
        <p className="text-xs text-neutral-500">
          Kategori induk tidak dapat diubah setelah dibuat.{parentName ? ` Saat ini: ${parentName}.` : ""}
        </p>
        <TextAreaField
          label="Deskripsi"
          name="description"
          defaultValue={category.description}
          errors={state.fieldErrors?.description}
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
