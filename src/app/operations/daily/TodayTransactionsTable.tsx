"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { TEXT_TONE_CLASSES, type Tone } from "@/components/ui/tone";
import { labelOrRaw, TRANSACTION_TYPE_LABEL, TRANSACTION_STATUS_LABEL } from "@/lib/transaction-history/labels";
import { formatSignedAmount, resolveProjectOverheadLabel } from "@/lib/transaction-history/present";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";

const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  reversed: "danger",
  partially_reversed: "danger",
  reversal: "neutral",
};

function formatTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

// Client-side search/filter only — the row set itself is the exact same
// production trusted-ledger data the server already fetched for today
// (Riwayat Transaksi's own source), just narrowed to businessDate. No new
// aggregation or query.
export function TodayTransactionsTable({ transactions }: { transactions: TrustedTransactionRow[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const types = useMemo(() => {
    const seen = new Set(transactions.map((row) => row.transaction_type).filter((value): value is string => !!value));
    return Array.from(seen);
  }, [transactions]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((row) => {
      if (typeFilter && row.transaction_type !== typeFilter) return false;
      if (!term) return true;
      const haystack = `${row.description ?? ""} ${row.vessel_name ?? ""} ${row.project_code ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [transactions, search, typeFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Transaksi Hari Ini</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari transaksi..."
            aria-label="Cari transaksi hari ini"
            className="h-9 w-48 rounded-md border-[1.5px] border-neutral-300 bg-white px-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filter jenis transaksi"
            className="h-9 rounded-md border-[1.5px] border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700"
          >
            <option value="">Semua Jenis</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {labelOrRaw(TRANSACTION_TYPE_LABEL, type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Belum ada transaksi hari ini.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Tidak ada transaksi yang cocok dengan pencarian.
        </p>
      ) : (
        <Table minWidth="720px">
          <TableHead>
            <TableRow>
              <Th>Waktu</Th>
              <Th>Jenis</Th>
              <Th>Project Kapal</Th>
              <Th>Deskripsi</Th>
              <Th align="right">Efek Kas</Th>
              <Th align="center">Status</Th>
            </TableRow>
          </TableHead>
          <tbody>
            {filtered.map((row) => (
              <TableRow key={row.logical_transaction_id}>
                <Td>{formatTime(row.created_at)}</Td>
                <Td>{labelOrRaw(TRANSACTION_TYPE_LABEL, row.transaction_type)}</Td>
                <Td>{resolveProjectOverheadLabel(row)}</Td>
                <Td className="max-w-[220px] truncate" title={row.description ?? undefined}>
                  {row.description ?? "-"}
                </Td>
                <Td align="right">
                  <SignedAmount value={row.signed_cash_effect} />
                </Td>
                <Td align="center">
                  <Badge tone={row.status ? (STATUS_TONE[row.status] ?? "neutral") : "neutral"}>
                    {labelOrRaw(TRANSACTION_STATUS_LABEL, row.status)}
                  </Badge>
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function SignedAmount({ value }: { value: number | null }) {
  const presentation = formatSignedAmount(value);
  const tone: Tone = presentation.isZero ? "neutral" : presentation.isPositive ? "success" : "danger";
  return <span className={`tabular-nums ${TEXT_TONE_CLASSES[tone]}`}>{presentation.text}</span>;
}
