"use client";

import { useMemo, useState } from "react";
import { formatRupiah } from "@/lib/operations-daily/format";
import type { CashImportRowRow } from "@/lib/cash-import-staging/repository";
import { RowDispositionControl } from "./RowDispositionControl";

type StatusFilter = "all" | "valid" | "warning" | "error";

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "valid", label: "Valid" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

const STATUS_BADGE_CLASS: Record<string, string> = {
  valid: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  error: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function RowTable({
  batchId,
  rows,
  canWrite,
}: {
  batchId: string;
  rows: CashImportRowRow[];
  canWrite: boolean;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const transactionRows = useMemo(
    () => rows.filter((row) => row.provisional_classification !== "opening_cash"),
    [rows],
  );
  const filteredRows = useMemo(
    () => (filter === "all" ? transactionRows : transactionRows.filter((row) => row.status === filter)),
    [transactionRows, filter],
  );

  return (
    <section className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-neutral-500">
          Baris Transaksi ({filteredRows.length} dari {transactionRows.length})
        </h2>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                filter === f.value
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
              <th className="py-1.5 pr-2">Baris</th>
              <th className="py-1.5 pr-2">Keterangan</th>
              <th className="py-1.5 pr-2">Kapal/Kategori</th>
              <th className="py-1.5 pr-2 text-right">Debit</th>
              <th className="py-1.5 pr-2 text-right">Kredit</th>
              <th className="py-1.5 pr-2">Status</th>
              <th className="py-1.5 pr-2">Duplikat</th>
              <th className="py-1.5">Disposisi</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                <td className="py-1.5 pr-2">{row.source_row_number}</td>
                <td className="py-1.5 pr-2">{row.description ?? "-"}</td>
                <td className="py-1.5 pr-2">{row.vessel_label ?? "-"}</td>
                <td className="py-1.5 pr-2 text-right">{row.debit === null ? "-" : formatRupiah(row.debit)}</td>
                <td className="py-1.5 pr-2 text-right">{row.credit === null ? "-" : formatRupiah(row.credit)}</td>
                <td className="py-1.5 pr-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_BADGE_CLASS[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-1.5 pr-2">
                  {row.duplicate_group_key ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Kandidat Duplikat
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-1.5">
                  <RowDispositionControl
                    key={`${row.id}-${row.disposition ?? "unset"}-${row.disposition_reason ?? ""}`}
                    batchId={batchId}
                    row={row}
                    canWrite={canWrite}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
