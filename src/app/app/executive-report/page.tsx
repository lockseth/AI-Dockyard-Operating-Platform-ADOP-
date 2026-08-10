import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { Card, StatCard } from "@/components/ui/Card";
import { canAccessExecutiveReport } from "@/lib/executive-report/access";
import { getExecutiveReportForActiveTenant } from "@/lib/executive-report/service";
import { formatRupiah } from "@/lib/operations-daily/format";
import { AccessDenied } from "./AccessDenied";
import { AttentionSection } from "./AttentionSection";

const QUICK_ACTION_LINK_CLASS =
  "inline-flex h-10 items-center justify-center rounded-lg border-[1.5px] border-neutral-300 bg-white px-[18px] text-sm font-semibold text-brand-navy transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

// Local, presentational-only icon set for this page's KPI row (AODP visual
// lock: KPI icons get a soft-blue container). Kept local rather than reused
// from Owner Control's SectionIcon set, which is scoped to that route.
const ICON_PROPS = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" } as const;

function VesselIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path
        d="M4 15h16l-1.8 4.2a2 2 0 0 1-1.84 1.3H7.64a2 2 0 0 1-1.84-1.3L4 15Zm2-4V6a1 1 0 0 1 1-1h3v6M13 5v6m5 4V9.5a1 1 0 0 0-.4-.8L13 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden>
      <path
        d="M7 3h8l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 13.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Gate 5C — owner-first executive report. Every figure is composed from
// canonical *ForActiveTenant reads (see src/lib/executive-report/service.ts)
// — this page renders the already-computed summary, it never queries or
// derives a financial figure itself.
export default async function ExecutiveReportPage() {
  const context = await requireTenantContext();

  if (!canAccessExecutiveReport(context.roles)) {
    return (
      <AppShell title="Laporan Eksekutif" sectionLabel="Owner">
        <AccessDenied />
      </AppShell>
    );
  }

  const summary = await getExecutiveReportForActiveTenant();

  return (
    <AppShell title="Laporan Eksekutif" sectionLabel="Owner" showMobileTitle={false}>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Eksekutif</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-neutral-400">
            Ringkasan Project Kapal aktif, biaya berjalan, dan status billing — seluruhnya dihitung dari data Project
            Kapal dan Billing Workspace yang sudah ada.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Apa yang Sedang Terjadi</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/app/vessel-projects"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <StatCard
                eyebrow="Project Kapal Aktif"
                value={summary.activeProjectCount}
                icon={<VesselIcon />}
                // Reserved-but-empty note slot — the other three cards in
                // this row all have one, so this card stays the same height
                // instead of rendering shorter (same fix as Owner Control's
                // KPI tiles: reserve the slot, hide the content).
                note={
                  <span aria-hidden className="invisible">
                    &nbsp;
                  </span>
                }
              />
            </Link>
            <StatCard
              eyebrow="Biaya Berjalan"
              value={formatRupiah(summary.costRunningTotal)}
              note="Project aktif"
              icon={<CostIcon />}
            />
            <Link
              href="/billing/workspace"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <StatCard
                eyebrow="Kapal Belum Ditagihkan"
                value={summary.unbilled.count}
                note={formatRupiah(summary.unbilled.amountTotal)}
                icon={<BillingIcon />}
              />
            </Link>
            <Link
              href="/billing/invoices"
              className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              <StatCard
                eyebrow="Invoice Diterbitkan"
                value={summary.issuedInvoices.count}
                note={`Nilai Tertagih: ${formatRupiah(summary.issuedInvoices.valueTotal)}`}
                icon={<InvoiceIcon />}
              />
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-500">Apa yang Perlu Perhatian</h2>
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              {summary.attentionTotalCount} item
            </span>
          </div>
          <Card className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-neutral-600 dark:text-neutral-300">
            <span>Belum Ditagih: {summary.attentionBreakdown.unbilled}</span>
            <span>Draft Belum Lengkap: {summary.attentionBreakdown.draftIncomplete}</span>
            <span>Belum Dikirim: {summary.attentionBreakdown.notDelivered}</span>
            <span>Pengiriman Gagal: {summary.attentionBreakdown.deliveryFailed}</span>
            <span>Belum Diterima: {summary.attentionBreakdown.notAcknowledged}</span>
          </Card>
          <AttentionSection items={summary.attentionItems} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Tindakan Berikutnya</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/billing/workspace" className={QUICK_ACTION_LINK_CLASS}>
              Billing Workspace
            </Link>
            <Link href="/billing/invoices" className={QUICK_ACTION_LINK_CLASS}>
              Invoice &amp; Evidence
            </Link>
            <Link href="/app/vessel-projects" className={QUICK_ACTION_LINK_CLASS}>
              Project Kapal
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
