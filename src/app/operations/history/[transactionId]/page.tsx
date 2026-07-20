import Link from "next/link";
import { notFound } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";
import { branding } from "@/lib/branding";
import { canViewTrustedTransactionHistory } from "@/lib/transaction-history/access";
import { getTrustedTransactionDetailForActiveTenant } from "@/lib/transaction-history/service";
import { getCashImportBatchDetailForActiveTenant } from "@/lib/cash-import-staging/service";
import { AccessDenied } from "../AccessDenied";
import { DetailPanel } from "./DetailPanel";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const context = await requireTenantContext();
  if (!canViewTrustedTransactionHistory(context.roles)) {
    return <AccessDenied />;
  }

  const { transactionId } = await params;
  const decodedId = decodeURIComponent(transactionId);

  const transaction = await getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: decodedId });
  if (!transaction) {
    notFound();
  }

  const [originalTransaction, reversalTransaction, importBatchDetail] = await Promise.all([
    transaction.reversal_of_logical_id
      ? getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: transaction.reversal_of_logical_id })
      : Promise.resolve(null),
    transaction.reversed_by_logical_id
      ? getTrustedTransactionDetailForActiveTenant({ logicalTransactionId: transaction.reversed_by_logical_id })
      : Promise.resolve(null),
    transaction.import_batch_id
      ? getCashImportBatchDetailForActiveTenant({ batchId: transaction.import_batch_id })
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {branding.productName} {branding.brandedBy}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Detail Transaksi</h1>
          <Link
            href="/operations/history"
            className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Kembali ke Riwayat Transaksi
          </Link>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Keluar
          </button>
        </form>
      </header>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <DetailPanel
          transaction={transaction}
          originalTransaction={originalTransaction}
          reversalTransaction={reversalTransaction}
          importBatch={importBatchDetail?.batch ?? null}
        />
      </main>
    </div>
  );
}
