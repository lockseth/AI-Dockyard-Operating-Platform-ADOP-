"use client";

import { useActionState, useState } from "react";
import { createExpenseDraftAction } from "@/lib/operations-daily/actions";
import { FormError } from "@/components/master-data/FormError";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { ExpenseFormFieldsAllocation, ExpenseFormFieldsInfo } from "./ExpenseFormFields";
import { OpeningCashEntryForm, StandardCashEntryForm } from "./CashEntryForm";
import type { ExpenseSubmissionActionResult } from "@/lib/expense-approvals/service";
import type { ExpenseEntryScope } from "@/lib/expense-approvals/types";
import type { VesselProjectOption } from "@/lib/operations-daily/view-model";

type TransactionType = "opening_cash" | "cash_top_up" | "expense" | "shared_overhead" | "other_cash_in";

const TYPE_TABS: Array<{ value: TransactionType; label: string }> = [
  { value: "opening_cash", label: "Saldo Awal" },
  { value: "cash_top_up", label: "Tambah Kas" },
  { value: "expense", label: "Biaya Project Kapal" },
  { value: "shared_overhead", label: "Biaya Bersama/Overhead" },
  { value: "other_cash_in", label: "Kas Masuk Lainnya" },
];

const ENTRY_SCOPE_BY_TAB: Partial<Record<TransactionType, ExpenseEntryScope>> = {
  expense: "project",
  shared_overhead: "shared_overhead",
};

const ALLOCATION_ERROR_KEYS = ["projectId", "categoryId", "vendorId"];
const INFO_ERROR_KEYS = ["amount", "description", "referenceNumber"];

const initialExpenseState: ExpenseSubmissionActionResult = {};

// Unifies OpenCashSection's opening-cash/cash-top-up entries, ExpenseFormSection's
// draft form, and other_cash_in into one "+ Tambah Transaksi" workspace, matching
// the approved prototype's tabbed/collapsible layout. Every tab delegates to the
// exact same production server action + validation as before — this component
// only changes how the fields are grouped and revealed, never what gets submitted.
export function TransactionWorkspace({
  poolId,
  businessDate,
  mutationOpen,
  openingCashAlreadyPosted,
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
  onClose,
}: {
  poolId: string;
  businessDate: string;
  mutationOpen: boolean;
  openingCashAlreadyPosted: boolean;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions: VesselProjectOption[];
  onClose: () => void;
}) {
  const [activeType, setActiveType] = useState<TransactionType>(
    openingCashAlreadyPosted ? "expense" : "opening_cash",
  );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-tight">Tambah Transaksi</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup form Tambah Transaksi"
          className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-neutral-800"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => {
          const disabled = tab.value === "opening_cash" && openingCashAlreadyPosted;
          return (
            <button
              key={tab.value}
              type="button"
              disabled={disabled}
              onClick={() => setActiveType(tab.value)}
              aria-pressed={activeType === tab.value}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40 ${
                activeType === tab.value
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {activeType === "opening_cash" ? (
          openingCashAlreadyPosted ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Saldo awal untuk {businessDate} sudah diposting. Koreksi hanya dapat dilakukan melalui reversal di
              Riwayat Transaksi.
            </p>
          ) : (
            <OpeningCashEntryForm
              poolId={poolId}
              label="Catat Saldo Awal"
              disabled={!mutationOpen}
              businessDate={businessDate}
            />
          )
        ) : null}

        {activeType === "cash_top_up" ? (
          <StandardCashEntryForm poolId={poolId} entryType="cash_top_up" label="Tambah Kas" disabled={!mutationOpen} />
        ) : null}

        {activeType === "other_cash_in" ? (
          <StandardCashEntryForm
            poolId={poolId}
            entryType="other_cash_in"
            label="Kas Masuk Lainnya"
            disabled={!mutationOpen}
          />
        ) : null}

        {activeType === "expense" || activeType === "shared_overhead" ? (
          <ExpenseWorkspaceForm
            key={activeType}
            entryScope={ENTRY_SCOPE_BY_TAB[activeType]!}
            poolId={poolId}
            projectOptions={projectOptions}
            categoryOptions={categoryOptions}
            vendorOptions={vendorOptions}
            facilityOptions={facilityOptions}
            disabled={!mutationOpen}
            onSaved={onClose}
          />
        ) : null}
      </div>
    </Card>
  );
}

function ExpenseWorkspaceForm({
  entryScope,
  poolId,
  projectOptions,
  categoryOptions,
  vendorOptions,
  facilityOptions,
  disabled,
  onSaved,
}: {
  entryScope: ExpenseEntryScope;
  poolId: string;
  projectOptions: VesselProjectOption[];
  categoryOptions: VesselProjectOption[];
  vendorOptions: VesselProjectOption[];
  facilityOptions: VesselProjectOption[];
  disabled: boolean;
  onSaved: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createExpenseDraftAction, initialExpenseState);
  const hasAllocationError = ALLOCATION_ERROR_KEYS.some((key) => (state.fieldErrors?.[key]?.length ?? 0) > 0);
  const hasInfoError = INFO_ERROR_KEYS.some((key) => (state.fieldErrors?.[key]?.length ?? 0) > 0);

  // Render-phase state sync (same pattern as useCloseEditOnSuccess) — a
  // successful save closes the workspace back to the table the same render,
  // a validation error leaves it open so the relevant section force-opens.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.submission && !state.error && !state.fieldErrors) {
      onSaved();
    }
  }

  if (disabled) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Kas hari ini tidak sedang open — pencatatan biaya baru dikunci.
      </p>
    );
  }

  const allocationTitle = entryScope === "shared_overhead" ? "Alokasi Biaya Bersama" : "Alokasi Project";

  return (
    <form action={formAction} className="flex flex-col gap-3" key={state.submission?.id}>
      <input type="hidden" name="poolId" value={poolId} />
      <input type="hidden" name="entryScope" value={entryScope} />
      <Disclosure title="Informasi Utama" defaultOpen hasError={hasInfoError}>
        <ExpenseFormFieldsInfo fieldErrors={state.fieldErrors} />
      </Disclosure>
      <Disclosure title={allocationTitle} defaultOpen hasError={hasAllocationError} forceOpen={hasAllocationError}>
        <ExpenseFormFieldsAllocation
          entryScope={entryScope}
          projectOptions={projectOptions}
          categoryOptions={categoryOptions}
          vendorOptions={vendorOptions}
          facilityOptions={facilityOptions}
          fieldErrors={state.fieldErrors}
        />
      </Disclosure>
      <FormError error={state.error} />
      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          {isPending ? "Menyimpan..." : "Simpan Transaksi"}
        </Button>
      </div>
    </form>
  );
}
