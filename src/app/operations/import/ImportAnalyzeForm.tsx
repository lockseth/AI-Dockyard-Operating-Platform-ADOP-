"use client";

import { useActionState } from "react";
import { analyzeCashReportUploadAction } from "@/lib/cash-import/actions";
import type { CashImportActionResult } from "@/lib/cash-import/types";
import { FormError } from "@/components/master-data/FormError";
import { SummaryPanel } from "./SummaryPanel";
import { PreviewTable } from "./PreviewTable";

export function ImportAnalyzeForm() {
  const [state, formAction, isPending] = useActionState<CashImportActionResult | null, FormData>(
    analyzeCashReportUploadAction,
    null,
  );

  return (
    <div className="flex flex-col gap-6">
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
          {isPending ? "Menganalisis..." : "Analisis File"}
        </button>
        {state && !state.ok && "forbidden" in state ? (
          <FormError error="Anda tidak memiliki izin untuk mengakses import." />
        ) : null}
        {state && !state.ok && "fileError" in state ? <FormError error={state.fileError.message} /> : null}
      </form>

      {state && state.ok ? (
        <>
          <div
            role="status"
            className="w-fit rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
          >
            DRY RUN — BELUM ADA DATA YANG DISIMPAN
          </div>
          <SummaryPanel analysis={state.analysis} />
          <PreviewTable rows={state.analysis.rows} />
        </>
      ) : null}
    </div>
  );
}
