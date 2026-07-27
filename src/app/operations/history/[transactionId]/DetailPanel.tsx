import Link from "next/link";
import { formatBusinessDateLabel, formatRupiah } from "@/lib/operations-daily/format";
import {
  labelOrRaw,
  PARTIALLY_REVERSED_EXPLANATION,
  TRANSACTION_DIRECTION_LABEL,
  TRANSACTION_SOURCE_LABEL,
  TRANSACTION_STATUS_LABEL,
  TRANSACTION_TYPE_LABEL,
} from "@/lib/transaction-history/labels";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";
import { buildEffectClauses } from "@/lib/transaction-history/present";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";
import type { TenantRole } from "@/lib/auth/tenant";
import type { TransactionInvoiceBindingRow } from "@/lib/invoice-evidence/types";
import { Disclosure } from "@/components/ui/Disclosure";
import { ReversalControl } from "./ReversalControl";
import { InvoiceBindingsDisclosure } from "./InvoiceBindingsDisclosure";

function projectDescriptor(transaction: TrustedTransactionRow): string {
  if (transaction.vessel_name) {
    return transaction.project_code ? `${transaction.vessel_name} (${transaction.project_code})` : transaction.vessel_name;
  }
  return "Shared Overhead (tidak dialokasikan ke Project Kapal)";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function LinkedTransactionCard({
  title,
  transaction,
}: {
  title: string;
  transaction: TrustedTransactionRow;
}) {
  return (
    <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span>
          {labelOrRaw(TRANSACTION_TYPE_LABEL, transaction.transaction_type)} —{" "}
          {transaction.business_date ? formatBusinessDateLabel(transaction.business_date) : "-"} —{" "}
          {formatRupiah(transaction.display_amount)}
        </span>
        {transaction.logical_transaction_id ? (
          <Link
            href={`/operations/history/${encodeURIComponent(transaction.logical_transaction_id)}`}
            className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Lihat
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function DetailPanel({
  transaction,
  originalTransaction,
  reversalTransaction,
  importBatch,
  invoiceBindings,
  viewerRoles,
}: {
  transaction: TrustedTransactionRow;
  originalTransaction: TrustedTransactionRow | null;
  reversalTransaction: TrustedTransactionRow | null;
  importBatch: CashImportBatchRow | null;
  invoiceBindings: TransactionInvoiceBindingRow[];
  viewerRoles: TenantRole[];
}) {
  const effectClauses = buildEffectClauses(transaction);
  const isPairedRefund = transaction.transaction_type === "project_refund" || transaction.transaction_type === "project_refund_reversal";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Transaksi ini berasal dari ledger ADOP yang tidak dapat diedit atau dihapus. Koreksi dicatat sebagai transaksi
        reversal terpisah.
      </section>

      {transaction.status === "partially_reversed" ? (
        <section
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <div className="font-semibold">Reversal Tidak Lengkap</div>
          <p className="mt-1 text-xs">{PARTIALLY_REVERSED_EXPLANATION}</p>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{labelOrRaw(TRANSACTION_TYPE_LABEL, transaction.transaction_type)}</h2>
          <span className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium dark:border-neutral-700">
            {labelOrRaw(TRANSACTION_STATUS_LABEL, transaction.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          {effectClauses.length > 0 ? `${effectClauses.join(", dan ")}.` : "Transaksi ini tidak memiliki efek finansial."}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800">
        <Field label="ID Transaksi" value={<span className="break-all font-mono text-xs">{transaction.logical_transaction_id}</span>} />
        <Field label="Tanggal Bisnis" value={transaction.business_date ? formatBusinessDateLabel(transaction.business_date) : "-"} />
        <Field label="Dicatat Pada" value={transaction.created_at ? new Date(transaction.created_at).toLocaleString("id-ID") : "-"} />
        <Field label="Project Kapal / Overhead" value={projectDescriptor(transaction)} />
        <Field label="Arah" value={labelOrRaw(TRANSACTION_DIRECTION_LABEL, transaction.transaction_direction)} />
        <Field label="Sumber" value={labelOrRaw(TRANSACTION_SOURCE_LABEL, transaction.source)} />
        <Field label="Nominal" value={formatRupiah(transaction.display_amount)} />
        <Field label="Deskripsi/Alasan" value={transaction.description ?? "-"} />
        <Field label="Nomor Referensi" value={transaction.reference_number ?? "-"} />
        <Field label="Dicatat Oleh (Actor)" value={<span className="break-all font-mono text-xs">{transaction.actor_user_id ?? "-"}</span>} />
      </section>

      <Disclosure title="Ledger Terkait (Provenance)" defaultOpen={false}>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {transaction.cash_entry_id ? (
            <Field label="ID Entry Kas" value={<span className="break-all font-mono text-xs">{transaction.cash_entry_id}</span>} />
          ) : null}
          {transaction.cost_entry_id ? (
            <Field label="ID Entry Biaya Proyek" value={<span className="break-all font-mono text-xs">{transaction.cost_entry_id}</span>} />
          ) : null}
        </dl>
        {isPairedRefund ? (
          <p className="text-xs text-neutral-500">
            Ini adalah kejadian bisnis tunggal (cash-in dan cost-reduction/increase yang berpasangan) — nominal di atas
            tidak dihitung dua kali; kedua efek ledger di atas terjadi bersamaan dari satu baris import yang sama.
          </p>
        ) : null}
        {importBatch ? (
          <div className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Import Batch</div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span>
                {importBatch.source_filename} — status: {importBatch.status}
              </span>
              <Link
                href={`/operations/import/${importBatch.id}`}
                className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                Lihat Batch
              </Link>
            </div>
          </div>
        ) : null}
      </Disclosure>

      <InvoiceBindingsDisclosure bindings={invoiceBindings} />

      {originalTransaction || reversalTransaction ? (
        <Disclosure title="Hubungan Reversal" defaultOpen>
          {originalTransaction ? <LinkedTransactionCard title="Transaksi Asli" transaction={originalTransaction} /> : null}
          {reversalTransaction ? <LinkedTransactionCard title="Transaksi Pembatal" transaction={reversalTransaction} /> : null}
        </Disclosure>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-neutral-500">Koreksi</h3>
        <ReversalControl transaction={transaction} viewerRoles={viewerRoles} />
      </section>
    </div>
  );
}
