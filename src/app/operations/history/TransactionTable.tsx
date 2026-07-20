import Link from "next/link";
import { formatBusinessDateLabel } from "@/lib/operations-daily/format";
import { labelOrRaw, TRANSACTION_SOURCE_LABEL, TRANSACTION_STATUS_LABEL, TRANSACTION_TYPE_LABEL } from "@/lib/transaction-history/labels";
import { formatSignedAmount } from "@/lib/transaction-history/present";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";

function SignedAmount({ value }: { value: number | null }) {
  const presentation = formatSignedAmount(value);
  if (presentation.isZero) {
    return <span className="text-neutral-400">{presentation.text}</span>;
  }
  return (
    <span className={presentation.isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
      {presentation.text}
    </span>
  );
}

export function TransactionTable({ transactions }: { transactions: TrustedTransactionRow[] }) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 p-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        Tidak ada transaksi untuk filter saat ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
          <tr>
            <th className="px-3 py-2">Tanggal</th>
            <th className="px-3 py-2">Jenis</th>
            <th className="px-3 py-2">Project / Overhead</th>
            <th className="px-3 py-2">Deskripsi</th>
            <th className="px-3 py-2">Sumber</th>
            <th className="px-3 py-2 text-right">Efek Kas</th>
            <th className="px-3 py-2 text-right">Efek Biaya Proyek</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {transactions.map((row) => (
            <tr key={row.logical_transaction_id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-900">
              <td className="whitespace-nowrap px-3 py-2">{row.business_date ? formatBusinessDateLabel(row.business_date) : "-"}</td>
              <td className="px-3 py-2">{labelOrRaw(TRANSACTION_TYPE_LABEL, row.transaction_type)}</td>
              <td className="px-3 py-2">
                {row.vessel_name ? `${row.vessel_name}${row.project_code ? ` (${row.project_code})` : ""}` : "Shared Overhead"}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2 text-neutral-600 dark:text-neutral-400" title={row.description ?? undefined}>
                {row.description ?? "-"}
              </td>
              <td className="px-3 py-2">{labelOrRaw(TRANSACTION_SOURCE_LABEL, row.source)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <SignedAmount value={row.signed_cash_effect} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <SignedAmount value={row.signed_project_cost_effect} />
              </td>
              <td className="px-3 py-2">{labelOrRaw(TRANSACTION_STATUS_LABEL, row.status)}</td>
              <td className="px-3 py-2 text-right">
                {row.logical_transaction_id ? (
                  <Link
                    href={`/operations/history/${encodeURIComponent(row.logical_transaction_id)}`}
                    className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
                  >
                    Lihat Detail
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
