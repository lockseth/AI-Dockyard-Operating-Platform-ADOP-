import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canAccessInvoiceEvidence } from "@/lib/invoice-evidence/access";
import { listInvoicesForActiveTenant } from "@/lib/invoice-evidence/service";
import { AccessDenied } from "./AccessDenied";
import { CreateDraftButton } from "./CreateDraftButton";
import { InvoiceTable } from "./InvoiceTable";

export default async function InvoiceListPage() {
  const context = await requireTenantContext();
  if (!canAccessInvoiceEvidence(context.roles)) {
    return (
      <AppShell title="Invoice & Evidence" sectionLabel="Billing">
        <AccessDenied />
      </AppShell>
    );
  }

  const invoices = await listInvoicesForActiveTenant();

  return (
    <AppShell title="Invoice & Evidence" sectionLabel="Billing" showMobileTitle={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invoice &amp; Evidence</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Tagihkan transaksi Project Kapal yang sudah closed, terbitkan invoice, dan kelola dokumen bertanda
              tangan/cap sebagai evidence final.
            </p>
          </div>
          <CreateDraftButton />
        </div>

        <main className="flex flex-1 flex-col gap-6 pb-16">
          <InvoiceTable invoices={invoices} />
        </main>
      </div>
    </AppShell>
  );
}
