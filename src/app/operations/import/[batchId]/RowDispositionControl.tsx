"use client";

import { useActionState, useState } from "react";
import { setCashImportRowDispositionAction } from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import type { CashImportRowRow } from "@/lib/cash-import-staging/repository";
import { FormError } from "@/components/master-data/FormError";
import { inputClassName } from "@/components/master-data/fields";

const initialState: CashImportStagingActionResult = {};

const DISPOSITION_LABEL: Record<string, string> = {
  include: "Sertakan",
  skip: "Lewati",
  manual_review: "Tinjau Manual",
};

export function RowDispositionControl({
  batchId,
  row,
  canWrite,
}: {
  batchId: string;
  row: CashImportRowRow;
  canWrite: boolean;
}) {
  const [state, formAction, isPending] = useActionState(setCashImportRowDispositionAction, initialState);
  const [disposition, setDisposition] = useState(row.disposition ?? "");
  const [reason, setReason] = useState(row.disposition_reason ?? "");

  if (!canWrite) {
    return (
      <span className="text-xs text-neutral-500">
        {row.disposition ? DISPOSITION_LABEL[row.disposition] : "Belum diputuskan"}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={row.id} />
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          name="disposition"
          value={disposition}
          onChange={(event) => setDisposition(event.target.value)}
          aria-label="Disposisi baris"
          className={`${inputClassName} px-2 py-1 text-xs`}
        >
          <option value="" disabled>
            Pilih...
          </option>
          <option value="include" disabled={row.status === "error"}>
            Sertakan
          </option>
          <option value="skip">Lewati</option>
          <option value="manual_review">Tinjau Manual</option>
        </select>
        <button
          type="submit"
          disabled={isPending || !disposition}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
        >
          {isPending ? "..." : "Simpan"}
        </button>
      </div>
      {disposition === "skip" ? (
        <input
          type="text"
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Alasan (wajib)"
          className={`${inputClassName} px-2 py-1 text-xs`}
        />
      ) : null}
      <FormError error={state.error} />
    </form>
  );
}
