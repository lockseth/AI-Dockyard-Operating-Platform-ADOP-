import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import { canAccessBillingWorkspace } from "@/lib/billing-workspace/access";
import { getBillingRecordDetailForActiveTenant } from "@/lib/billing-workspace/service";
import { formatRupiah } from "@/lib/operations-daily/format";
import { getVesselProjectLifecycleStatusLabel } from "@/lib/vessel-projects/labels";
import { AccessDenied } from "../../invoices/AccessDenied";
import { InvoiceStatusBadge } from "../../invoices/InvoiceStatusBadge";
import { CompletenessChecklist } from "./CompletenessChecklist";
import { CreateDraftForProjectButton } from "./CreateDraftForProjectButton";

export default async function BillingRecordDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const context = await requireTenantContext();
  if (!canAccessBillingWorkspace(context.roles)) {
    return (
      <AppShell title="Detail Billing" sectionLabel="Billing">
        <AccessDenied />
      </AppShell>
    );
  }

  const { projectId } = await params;
  const detail = await getBillingRecordDetailForActiveTenant(projectId);
  if (!detail) {
    notFound();
  }

  const { project, client, vesselName, activeInvoice, voidInvoices, lines, completeness } = detail;

  return (
    <AppShell title="Detail Billing" sectionLabel="Billing" showMobileTitle={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <Link
          href="/billing/workspace"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          &larr; Kembali ke Ringkasan Billing
        </Link>

        <main className="flex flex-1 flex-col gap-6 pb-16">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold tracking-tight">{vesselName}</h1>
                <p className="text-sm text-neutral-500">
                  {project.project_code ?? "-"} &middot; {client?.display_name ?? "Client tidak dikenal"}
                </p>
              </div>
              {activeInvoice?.status ? <InvoiceStatusBadge status={activeInvoice.status} /> : null}
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500">Status Proyek</dt>
                <dd className="font-medium">{getVesselProjectLifecycleStatusLabel(project.lifecycle_status)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Mulai Proyek</dt>
                <dd className="font-medium">{new Date(project.start_date).toLocaleDateString("id-ID")}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Ditutup Pada</dt>
                <dd className="font-medium">
                  {project.closed_at ? new Date(project.closed_at).toLocaleDateString("id-ID") : "-"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="text-base font-bold">Billing Metadata &amp; Nilai Billing</h2>
            {activeInvoice ? (
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-neutral-500">Nomor Invoice</dt>
                  <dd className="font-medium">{activeInvoice.invoice_number ?? "Belum diregistrasi"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Tanggal Invoice</dt>
                  <dd className="font-medium">{activeInvoice.invoice_date ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Jatuh Tempo</dt>
                  <dd className="font-medium">{activeInvoice.due_date ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Jumlah Transaksi</dt>
                  <dd className="font-medium">{activeInvoice.line_count ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Nilai Billing</dt>
                  <dd className="font-medium">{formatRupiah(activeInvoice.total_amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Dokumen</dt>
                  <dd className="font-medium">
                    {activeInvoice.is_final_document
                      ? "Final Sah"
                      : (activeInvoice.current_version_status ?? "Belum diunggah")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-neutral-500">Belum ada Billing Record untuk project ini.</p>
            )}
            {activeInvoice?.id ? (
              <TextLink href={`/billing/invoices/${activeInvoice.id}`} className="w-fit text-sm font-medium">
                Kelola Invoice &amp; Evidence &rarr;
              </TextLink>
            ) : project.lifecycle_status === "closed" ? (
              <CreateDraftForProjectButton projectId={project.id} />
            ) : (
              <p className="text-xs text-neutral-500">
                Project harus berstatus Ditutup sebelum Billing Record dapat dibuat.
              </p>
            )}
          </Card>

          <CompletenessChecklist completeness={completeness} />

          {lines.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <h2 className="text-base font-bold">Rekap Pekerjaan &amp; Biaya</h2>
              <ul className="flex flex-col divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-neutral-600 dark:text-neutral-300">{line.description ?? "-"}</span>
                    <span className="font-medium">{formatRupiah(line.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {voidInvoices.length > 0 ? (
            <Card className="flex flex-col gap-2">
              <h2 className="text-base font-bold">Riwayat Invoice Void</h2>
              <ul className="flex flex-col gap-2 text-xs text-neutral-500">
                {voidInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <TextLink href={`/billing/invoices/${invoice.id}`} className="font-mono">
                      {invoice.id?.slice(0, 8)}
                    </TextLink>{" "}
                    &mdash; di-void{invoice.void_reason ? `: ${invoice.void_reason}` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </main>
      </div>
    </AppShell>
  );
}
