import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canViewTrustedTransactionHistory } from "@/lib/transaction-history/access";
import { listTrustedTransactionsForActiveTenant, summarizeTrustedTransactionsForActiveTenant } from "@/lib/transaction-history/service";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { AccessDenied } from "./AccessDenied";
import { HistoryFilters } from "./HistoryFilters";
import { SummaryCards } from "./SummaryCards";
import { TransactionTable } from "./TransactionTable";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildQuery(params: SearchParams, overrides: Record<string, string | undefined>): string {
  const merged: Record<string, string> = {};
  for (const key of ["dateFrom", "dateTo", "projectId", "transactionType", "transactionDirection", "source", "status", "search"]) {
    const value = first(params[key]);
    if (value) merged[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) merged[key] = value;
    else delete merged[key];
  }
  return new URLSearchParams(merged).toString();
}

export default async function TransactionHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requireTenantContext();
  if (!canViewTrustedTransactionHistory(context.roles)) {
    return (
      <AppShell title="Riwayat Transaksi" sectionLabel="Operasional">
        <AccessDenied />
      </AppShell>
    );
  }

  const params = await searchParams;
  const filters = {
    dateFrom: first(params.dateFrom),
    dateTo: first(params.dateTo),
    projectId: first(params.projectId),
    transactionType: first(params.transactionType),
    transactionDirection: first(params.transactionDirection),
    source: first(params.source),
    status: first(params.status),
    search: first(params.search),
  };
  const cursor = first(params.cursor);

  const [{ transactions, nextCursor }, summary, projects] = await Promise.all([
    listTrustedTransactionsForActiveTenant({ ...filters, cursor }),
    summarizeTrustedTransactionsForActiveTenant(filters),
    listVesselProjectsForActiveTenant(),
  ]);

  const nextHref = nextCursor ? `/operations/history?${buildQuery(params, { cursor: nextCursor })}` : null;

  return (
    <AppShell title="Riwayat Transaksi" sectionLabel="Operasional" showMobileTitle={false}>
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Riwayat Transaksi</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Transaksi ini berasal dari ledger ADOP yang tidak dapat diedit atau dihapus. Koreksi dicatat sebagai
          transaksi reversal terpisah — data di bawah ini adalah sumber kebenaran keuangan (Trusted).
        </p>
      </div>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <SummaryCards summary={summary} />
        <HistoryFilters value={filters} projects={projects} />
        <TransactionTable transactions={transactions} />
        {nextHref ? (
          <div className="flex justify-center">
            <Link
              href={nextHref}
              className="rounded-md border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Muat Lebih Banyak
            </Link>
          </div>
        ) : null}
      </main>
    </div>
    </AppShell>
  );
}
