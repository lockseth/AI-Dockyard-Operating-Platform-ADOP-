import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { StatCard } from "@/components/ui/Card";
import { canAccessBillingWorkspace } from "@/lib/billing-workspace/access";
import { listBillingWorkspaceForActiveTenant } from "@/lib/billing-workspace/service";
import { computeBillingWorkspaceKpis, filterBillingWorkspaceRows } from "@/lib/billing-workspace/view-model";
import { AccessDenied } from "../invoices/AccessDenied";
import { UnbilledAlertSection } from "./UnbilledAlertSection";
import { WorkspaceFilters } from "./WorkspaceFilters";
import { WorkspaceTable } from "./WorkspaceTable";

export default async function BillingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const context = await requireTenantContext();
  if (!canAccessBillingWorkspace(context.roles)) {
    return (
      <AppShell title="Ringkasan Billing" sectionLabel="Billing">
        <AccessDenied />
      </AppShell>
    );
  }

  const { q, status } = await searchParams;
  const allRows = await listBillingWorkspaceForActiveTenant();
  const kpis = computeBillingWorkspaceKpis(allRows);
  const unbilledRows = allRows.filter((row) => row.isUnbilledAlert);
  const filteredRows = filterBillingWorkspaceRows(allRows, { search: q, status });

  return (
    <AppShell title="Ringkasan Billing" sectionLabel="Billing" showMobileTitle={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ringkasan Billing</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Kapal mana yang belum ditagihkan, billing mana yang belum lengkap dan penyebabnya, serta draft/invoice yang
            sudah terkait — seluruhnya dihitung dari data Project Kapal dan Invoice &amp; Evidence yang sudah ada.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard eyebrow="Belum Ditagih" value={kpis.unbilledCount} />
          <StatCard eyebrow="Belum Lengkap" value={kpis.incompleteCount} />
          <StatCard eyebrow="Siap Ditagih" value={kpis.readyCount} />
          <StatCard eyebrow="Sudah Memiliki Invoice" value={kpis.hasInvoiceCount} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">Unbilled Vessel Alert</h2>
          <UnbilledAlertSection rows={unbilledRows} />
        </section>

        <main className="flex flex-1 flex-col gap-4 pb-16">
          <h2 className="text-base font-bold">Daftar Project Kapal</h2>
          <WorkspaceFilters search={q} status={status} />
          <WorkspaceTable rows={filteredRows} />
        </main>
      </div>
    </AppShell>
  );
}
