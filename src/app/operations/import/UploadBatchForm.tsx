"use client";

import { useActionState } from "react";
import { uploadCashReportStagingAction } from "@/lib/cash-import-staging/actions";
import type { UploadCashImportResult } from "@/lib/cash-import-staging/service";
import { FormError } from "@/components/master-data/FormError";

const initialState: UploadCashImportResult = {};

export function UploadBatchForm() {
  const [state, formAction, isPending] = useActionState(uploadCashReportStagingAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <label htmlFor="file" className="text-sm font-medium">
        File Laporan Kas (.xlsx)
      </label>
      <input
        id="file"
        name="file"
        type="file"
        accept=".xlsx"
        required
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white dark:file:bg-neutral-100 dark:file:text-neutral-900"
      />
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {isPending ? "Mengunggah & Menganalisis..." : "Unggah & Staging"}
      </button>
      {state.fileError ? <FormError error={state.fileError.message} /> : null}
      <FormError error={state.error} />
    </form>
  );
}
