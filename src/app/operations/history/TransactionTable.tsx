import Link from "next/link";
import { formatBusinessDateLabel } from "@/lib/operations-daily/format";
import { labelOrRaw, TRANSACTION_SOURCE_LABEL, TRANSACTION_STATUS_LABEL, TRANSACTION_TYPE_LABEL } from "@/lib/transaction-history/labels";
import { formatSignedAmount } from "@/lib/transaction-history/present";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";

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
    <Table minWidth="900px">
      <TableHead>
        <TableRow>
          <Th>Tanggal</Th>
          <Th>Jenis</Th>
          <Th>Project / Overhead</Th>
          <Th>Deskripsi</Th>
          <Th>Sumber</Th>
          <Th align="right">Efek Kas</Th>
          <Th align="right">Efek Biaya Proyek</Th>
          <Th>Status</Th>
          <Th />
        </TableRow>
      </TableHead>
      <tbody>
        {transactions.map((row) => (
          <TableRow key={row.logical_transaction_id}>
            <Td className="whitespace-nowrap">{row.business_date ? formatBusinessDateLabel(row.business_date) : "-"}</Td>
            <Td>{labelOrRaw(TRANSACTION_TYPE_LABEL, row.transaction_type)}</Td>
            <Td>
              {row.vessel_name ? `${row.vessel_name}${row.project_code ? ` (${row.project_code})` : ""}` : "Shared Overhead"}
            </Td>
            <Td className="max-w-[220px] truncate text-neutral-600 dark:text-neutral-400" title={row.description ?? undefined}>
              {row.description ?? "-"}
            </Td>
            <Td>{labelOrRaw(TRANSACTION_SOURCE_LABEL, row.source)}</Td>
            <Td align="right" className="tabular-nums">
              <SignedAmount value={row.signed_cash_effect} />
            </Td>
            <Td align="right" className="tabular-nums">
              <SignedAmount value={row.signed_project_cost_effect} />
            </Td>
            <Td>{labelOrRaw(TRANSACTION_STATUS_LABEL, row.status)}</Td>
            <Td align="right">
              {row.logical_transaction_id ? (
                <Link
                  href={`/operations/history/${encodeURIComponent(row.logical_transaction_id)}`}
                  className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  Lihat Detail
                </Link>
              ) : null}
            </Td>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
