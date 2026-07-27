"use client";

import { useActionState } from "react";
import { bindInvoiceTransactionAction, unbindInvoiceTransactionAction } from "@/lib/invoice-evidence/actions";
import type { InvoiceEvidenceActionResult } from "@/lib/invoice-evidence/service";
import type { InvoiceEligibleTransactionRow, InvoiceStatus, InvoiceTransactionLineRow } from "@/lib/invoice-evidence/types";
import { formatRupiah } from "@/lib/operations-daily/format";
import { Table, TableHead, TableRow, Th, Td } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/master-data/FormError";
import { selectClassName } from "@/components/master-data/fields";
import { TextLink } from "@/components/ui/TextLink";

const initialState: InvoiceEvidenceActionResult = {};

function projectDescriptor(row: InvoiceEligibleTransactionRow): string {
  if (row.vessel_name) {
    return row.project_code ? `${row.vessel_name} (${row.project_code})` : row.vessel_name;
  }
  return row.project_code ?? "-";
}

export function BindingSection({
  invoiceId,
  invoiceStatus,
  lines,
  eligibleTransactions,
}: {
  invoiceId: string;
  invoiceStatus: InvoiceStatus | null;
  lines: InvoiceTransactionLineRow[];
  eligibleTransactions: InvoiceEligibleTransactionRow[];
}) {
  const isDraft = invoiceStatus === "draft";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-neutral-500">Transaksi Terikat</h2>
      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Belum ada transaksi terikat pada invoice ini.
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <Th>Deskripsi</Th>
              <Th align="right">Nominal</Th>
              {isDraft ? <Th align="right">Aksi</Th> : null}
            </TableRow>
          </TableHead>
          <tbody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <Td>{line.description}</Td>
                <Td align="right">{formatRupiah(line.amount)}</Td>
                {isDraft ? (
                  <Td align="right">
                    <UnbindButton invoiceId={invoiceId} lineId={line.id} />
                  </Td>
                ) : null}
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {isDraft ? <AddTransactionForm invoiceId={invoiceId} eligibleTransactions={eligibleTransactions} /> : null}
    </section>
  );
}

function UnbindButton({ invoiceId, lineId }: { invoiceId: string; lineId: string }) {
  const [state, formAction, isPending] = useActionState(unbindInvoiceTransactionAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="lineId" value={lineId} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs text-red-700 underline underline-offset-4 disabled:opacity-50 dark:text-red-300"
      >
        {isPending ? "Melepas..." : "Lepas"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}

function AddTransactionForm({
  invoiceId,
  eligibleTransactions,
}: {
  invoiceId: string;
  eligibleTransactions: InvoiceEligibleTransactionRow[];
}) {
  const [state, formAction, isPending] = useActionState(bindInvoiceTransactionAction, initialState);

  if (eligibleTransactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-neutral-500 dark:border-neutral-700">
        <p>
          Tidak ada transaksi Project Kapal closed lain yang tersedia untuk ditagihkan saat ini. Invoice hanya bisa
          mengikat transaksi dari Project Kapal yang statusnya sudah <strong>closed</strong> dan belum ditagihkan ke
          invoice lain.
        </p>
        <p className="mt-2">
          <TextLink href="/app/vessel-projects" tone="brand">
            Buka Project Kapal &rarr;
          </TextLink>{" "}
          untuk memeriksa atau menutup project yang relevan.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <label className="flex flex-1 min-w-[260px] flex-col gap-1 text-sm font-medium">
        Tambah Transaksi Closed
        <select name="transactionEntryId" required defaultValue="" className={selectClassName}>
          <option value="" disabled>
            Pilih transaksi...
          </option>
          {eligibleTransactions.map((entry) => (
            <option key={entry.transaction_entry_id ?? ""} value={entry.transaction_entry_id ?? ""}>
              {projectDescriptor(entry)} — {entry.description} — {formatRupiah(entry.amount)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" loading={isPending} size="md">
        {isPending ? "Mengikat..." : "Ikat ke Invoice"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}
