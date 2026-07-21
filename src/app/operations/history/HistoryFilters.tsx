import Link from "next/link";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import {
  TRANSACTION_DIRECTIONS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/lib/transaction-history/types";
import {
  TRANSACTION_DIRECTION_LABEL,
  TRANSACTION_SOURCE_LABEL,
  TRANSACTION_STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
} from "@/lib/transaction-history/labels";
import { SelectField } from "@/components/master-data/fields";

export interface HistoryFiltersValue {
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  transactionType?: string;
  transactionDirection?: string;
  source?: string;
  status?: string;
  search?: string;
}

const inputClass =
  "rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";

export function HistoryFilters({
  value,
  projects,
}: {
  value: HistoryFiltersValue;
  projects: VesselProjectRow[];
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Dari Tanggal
        <input type="date" name="dateFrom" defaultValue={value.dateFrom ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Sampai Tanggal
        <input type="date" name="dateTo" defaultValue={value.dateTo ?? ""} className={inputClass} />
      </label>
      <SelectField
        label="Project Kapal"
        name="projectId"
        defaultValue={value.projectId}
        placeholder="Semua Project"
        options={projects.map((project) => ({
          value: project.id,
          label: project.project_code ?? project.id.slice(0, 8),
        }))}
      />
      <SelectField
        label="Jenis Transaksi"
        name="transactionType"
        defaultValue={value.transactionType}
        placeholder="Semua Jenis"
        options={TRANSACTION_TYPES.map((type) => ({ value: type, label: TRANSACTION_TYPE_LABEL[type] }))}
      />
      <SelectField
        label="Arah"
        name="transactionDirection"
        defaultValue={value.transactionDirection}
        placeholder="Semua Arah"
        options={TRANSACTION_DIRECTIONS.map((direction) => ({
          value: direction,
          label: TRANSACTION_DIRECTION_LABEL[direction],
        }))}
      />
      <SelectField
        label="Sumber"
        name="source"
        defaultValue={value.source}
        placeholder="Semua Sumber"
        options={TRANSACTION_SOURCES.map((source) => ({ value: source, label: TRANSACTION_SOURCE_LABEL[source] }))}
      />
      <SelectField
        label="Status"
        name="status"
        defaultValue={value.status}
        placeholder="Semua Status"
        options={TRANSACTION_STATUSES.map((status) => ({ value: status, label: TRANSACTION_STATUS_LABEL[status] }))}
      />
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Cari
        <input
          type="text"
          name="search"
          defaultValue={value.search ?? ""}
          placeholder="Deskripsi, referensi, project..."
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
          Terapkan
        </button>
        <Link
          href="/operations/history"
          className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
