import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canViewTrustedTransactionHistory } from "@/lib/transaction-history/access";
import { getTrustedTransactionDetailForActiveTenant } from "@/lib/transaction-history/service";
import { getCashImportBatchDetailForActiveTenant } from "@/lib/cash-import-staging/service";
import { listTransactionInvoiceBindingsForActiveTenant } from "@/lib/invoice-evidence/service";
import { AccessDenied } from "../AccessDenied";
import { DetailPanel } from "./DetailPanel";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const context = await requireTenantContext();
  if (!canViewTrustedTransactionHistory(context.roles)) {
    return (
      <AppShell title="Detail Transaksi" sectionLabel="Operasional">
        <AccessDenied />
      </AppShell>
    );
  }

  const { transactionId } = await params;
  const decodedId = decodeURIComponent(transactionId);

  const transaction = await getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: decodedId });
  if (!transaction) {
    notFound();
  }

  const [originalTransaction, reversalTransaction, importBatchDetail, invoiceBindings] = await Promise.all([
    transaction.reversal_of_logical_id
      ? getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: transaction.reversal_of_logical_id })
      : Promise.resolve(null),
    transaction.reversed_by_logical_id
      ? getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: transaction.reversed_by_logical_id })
      : Promise.resolve(null),
    transaction.import_batch_id
      ? getCashImportBatchDetailForActiveTenant({ batchId: transaction.import_batch_id })
      : Promise.resolve(null),
    // Only a project_cost_ledger_entries row (cost_entry_id) can ever be
    // bound to an invoice — a cash-only transaction never has one.
    transaction.cost_entry_id
      ? listTransactionInvoiceBindingsForActiveTenant(transaction.cost_entry_id)
      : Promise.resolve([]),
  ]);

  return (
    <AppShell title="Detail Transaksi" sectionLabel="Operasional">
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <Link
        href="/operations/history"
        className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        &larr; Kembali ke Riwayat Transaksi
      </Link>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <DetailPanel
          transaction={transaction}
          originalTransaction={originalTransaction}
          reversalTransaction={reversalTransaction}
          importBatch={importBatchDetail?.batch ?? null}
          invoiceBindings={invoiceBindings}
          viewerRoles={context.roles}
        />
      </main>
    </div>
    </AppShell>
  );
}
