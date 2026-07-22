"use client";

import { useActionState, useState } from "react";
import {
  allocateSharedOverheadEntryAction,
  reverseSharedOverheadAllocationAction,
} from "@/lib/shared-overhead-allocation/actions";
import type {
  SharedOverheadAllocationActionResult,
} from "@/lib/shared-overhead-allocation/service";
import type { SharedOverheadAllocationCurrentRow, SharedOverheadAllocationStatusRow } from "@/lib/shared-overhead-allocation/repository";
import { getSharedOverheadAllocationStatusLabel } from "@/lib/shared-overhead-allocation/labels";
import { formatRupiah } from "@/lib/operations-daily/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CurrencyField, SelectField, TextField } from "@/components/master-data/fields";
import { FormError } from "@/components/master-data/FormError";
import type { Tone } from "@/components/ui/tone";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

const STATUS_TONE: Record<string, Tone> = {
  unallocated: "danger",
  partially_allocated: "warning",
  fully_allocated: "success",
};

const initialAllocateState: SharedOverheadAllocationActionResult = {};
const initialReverseState: SharedOverheadAllocationActionResult = {};

export function OverheadEntryRow({
  entry,
  allocations,
  projectOptions,
  projectLabelById,
  canMutate,
}: {
  entry: SharedOverheadAllocationStatusRow;
  allocations: SharedOverheadAllocationCurrentRow[];
  projectOptions: VesselProjectOption[];
  projectLabelById: Map<string, string>;
  canMutate: boolean;
}) {
  const [isAllocating, setIsAllocating] = useState(false);
  const [allocateState, allocateFormAction, isSubmittingAllocation] = useActionState(
    allocateSharedOverheadEntryAction,
    initialAllocateState,
  );

  const remaining = Math.max(0, (entry.overhead_amount ?? 0) - (entry.allocated_amount ?? 0));

  return (
    <li className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{entry.description ?? "-"}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{entry.business_date}</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{formatRupiah(entry.overhead_amount)}</p>
          <Badge tone={STATUS_TONE[entry.allocation_status ?? ""] ?? "neutral"} dot className="mt-1">
            {getSharedOverheadAllocationStatusLabel(entry.allocation_status)}
          </Badge>
        </div>
      </div>

      {allocations.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
          {allocations.map((allocation) => (
            <AllocationRow
              key={allocation.id}
              allocation={allocation}
              projectLabel={projectLabelById.get(allocation.project_id ?? "") ?? "Project tidak dikenal"}
              canMutate={canMutate}
            />
          ))}
        </ul>
      ) : null}

      {canMutate && remaining > 0 ? (
        <div className="mt-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          {!isAllocating ? (
            <Button variant="secondary" size="sm" onClick={() => setIsAllocating(true)}>
              + Alokasikan ke Project
            </Button>
          ) : (
            <form action={allocateFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="overheadEntryId" value={entry.overhead_entry_id ?? ""} />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Sisa belum dialokasikan: {formatRupiah(remaining)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Project Kapal"
                  name="projectId"
                  options={projectOptions}
                  errors={allocateState.fieldErrors?.projectId}
                />
                <CurrencyField label="Nominal Alokasi" name="amount" required errors={allocateState.fieldErrors?.amount} />
              </div>
              <TextField label="Catatan (opsional)" name="note" errors={allocateState.fieldErrors?.note} />
              <FormError error={allocateState.error} />
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" loading={isSubmittingAllocation}>
                  {isSubmittingAllocation ? "Menyimpan..." : "Simpan Alokasi"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setIsAllocating(false)}>
                  Batal
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </li>
  );
}

function AllocationRow({
  allocation,
  projectLabel,
  canMutate,
}: {
  allocation: SharedOverheadAllocationCurrentRow;
  projectLabel: string;
  canMutate: boolean;
}) {
  const [isReversing, setIsReversing] = useState(false);
  const [reverseState, reverseFormAction, isSubmittingReversal] = useActionState(
    reverseSharedOverheadAllocationAction,
    initialReverseState,
  );

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span>
          {projectLabel}
          {allocation.note ? ` — ${allocation.note}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-medium tabular-nums">{formatRupiah(allocation.amount)}</span>
          {canMutate ? (
            <button
              type="button"
              onClick={() => setIsReversing((prev) => !prev)}
              className="text-xs text-red-600 underline underline-offset-4 hover:text-red-700 dark:text-red-400"
            >
              {isReversing ? "Batal" : "Batalkan Alokasi"}
            </button>
          ) : null}
        </div>
      </div>

      {isReversing ? (
        <form
          action={reverseFormAction}
          onSubmit={(event) => {
            const form = event.currentTarget;
            const reason = (new FormData(form).get("reason") as string | null)?.trim();
            if (!reason) {
              event.preventDefault();
            }
          }}
          className="flex flex-col gap-2 rounded-md bg-neutral-50 p-2.5 dark:bg-neutral-900"
        >
          <input type="hidden" name="allocationId" value={allocation.id ?? ""} />
          <TextField
            label="Alasan Pembatalan"
            name="reason"
            required
            errors={reverseState.fieldErrors?.reason}
          />
          <FormError error={reverseState.error} />
          <div>
            <Button type="submit" variant="destructive" size="sm" loading={isSubmittingReversal}>
              {isSubmittingReversal ? "Membatalkan..." : "Konfirmasi Batalkan"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
