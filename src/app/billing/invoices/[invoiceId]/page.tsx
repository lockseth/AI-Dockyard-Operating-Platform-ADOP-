import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canAccessInvoiceEvidence } from "@/lib/invoice-evidence/access";
import { getInvoiceDetailForActiveTenant, listInvoiceEligibleTransactionsForActiveTenant } from "@/lib/invoice-evidence/service";
import { formatRupiah } from "@/lib/operations-daily/format";
import { AccessDenied } from "../AccessDenied";
import { InvoiceStatusBadge } from "../InvoiceStatusBadge";
import { BindingSection } from "./BindingSection";
import { LifecycleControls } from "./LifecycleControls";
import { EvidenceSection } from "./EvidenceSection";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const context = await requireTenantContext();
  if (!canAccessInvoiceEvidence(context.roles)) {
    return (
      <AppShell title="Detail Invoice" sectionLabel="Billing">
        <AccessDenied />
      </AppShell>
    );
  }

  const { invoiceId } = await params;
  const detail = await getInvoiceDetailForActiveTenant(invoiceId);
  if (!detail) {
    notFound();
  }

  const { invoice, lines, versions } = detail;
  const eligibleTransactions = invoice.status === "draft" ? await listInvoiceEligibleTransactionsForActiveTenant() : [];

  return (
    <AppShell title="Detail Invoice" sectionLabel="Billing">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <Link
          href="/billing/invoices"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          &larr; Kembali ke Invoice &amp; Evidence
        </Link>

        <main className="flex flex-1 flex-col gap-6 pb-16">
          <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-mono text-lg font-semibold">{invoice.id}</h1>
              {invoice.status ? <InvoiceStatusBadge status={invoice.status} /> : null}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Jumlah Transaksi</dt>
                <dd className="font-medium">{invoice.line_count ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Total Snapshot</dt>
                <dd className="font-medium">{formatRupiah(invoice.total_amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Dibuat</dt>
                <dd className="font-medium">{invoice.created_at ? new Date(invoice.created_at).toLocaleString("id-ID") : "-"}</dd>
              </div>
              {invoice.issued_at ? (
                <div>
                  <dt className="text-xs text-neutral-500">Diterbitkan</dt>
                  <dd className="font-medium">{new Date(invoice.issued_at).toLocaleString("id-ID")}</dd>
                </div>
              ) : null}
              {invoice.void_at ? (
                <div>
                  <dt className="text-xs text-neutral-500">Void Pada</dt>
                  <dd className="font-medium">{new Date(invoice.void_at).toLocaleString("id-ID")}</dd>
                </div>
              ) : null}
            </dl>
            {invoice.void_reason ? (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                Alasan void: {invoice.void_reason}
              </p>
            ) : null}
            {invoice.predecessor_invoice_id ? (
              <p className="mt-3 text-xs text-neutral-500">
                Reissue dari{" "}
                <Link
                  href={`/billing/invoices/${invoice.predecessor_invoice_id}`}
                  className="underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  invoice {invoice.predecessor_invoice_id.slice(0, 8)}
                </Link>
                .
              </p>
            ) : null}
            {invoice.successor_invoice_id ? (
              <p className="mt-1 text-xs text-neutral-500">
                Invoice ini sudah di-reissue menjadi{" "}
                <Link
                  href={`/billing/invoices/${invoice.successor_invoice_id}`}
                  className="underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  invoice {invoice.successor_invoice_id.slice(0, 8)}
                </Link>
                .
              </p>
            ) : null}
          </section>

          <BindingSection invoiceId={invoiceId} invoiceStatus={invoice.status} lines={lines} eligibleTransactions={eligibleTransactions} />

          <LifecycleControls invoiceId={invoiceId} invoiceStatus={invoice.status} lineCount={invoice.line_count ?? 0} hasSuccessor={!!invoice.successor_invoice_id} />

          <EvidenceSection
            invoiceId={invoiceId}
            tenantId={context.tenantId}
            invoiceStatus={invoice.status}
            versions={versions}
          />
        </main>
      </div>
    </AppShell>
  );
}
