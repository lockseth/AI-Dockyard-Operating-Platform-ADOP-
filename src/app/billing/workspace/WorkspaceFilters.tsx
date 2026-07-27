import Link from "next/link";
import { SelectField } from "@/components/master-data/fields";
import { BILLING_WORKSPACE_STATUS_LABEL } from "@/lib/billing-workspace/labels";
import type { BillingWorkspaceStatus } from "@/lib/billing-workspace/types";

// VOID is intentionally excluded — buildBillingWorkspaceRows never assigns
// it to a workspace row (a project whose only invoice is void collapses to
// NO_INVOICE, Contract §13.1 #3), so it would always match zero rows here.
const STATUS_OPTIONS: Exclude<BillingWorkspaceStatus, "VOID">[] = [
  "NOT_CLOSED",
  "NO_INVOICE",
  "DRAFT_INCOMPLETE",
  "DRAFT_READY_TO_ISSUE",
  "ISSUED_EVIDENCE_PENDING",
  "READY_TO_SEND",
  "LEGACY_RECORDED",
];

const inputClass = "rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";

export function WorkspaceFilters({ search, status }: { search?: string; status?: string }) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Cari
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Nama kapal, kode project, atau client..."
          className={inputClass}
        />
      </label>
      <SelectField
        label="Status Billing"
        name="status"
        defaultValue={status}
        placeholder="Semua Status"
        options={STATUS_OPTIONS.map((value) => ({ value, label: BILLING_WORKSPACE_STATUS_LABEL[value] }))}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Terapkan
        </button>
        <Link
          href="/billing/workspace"
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
