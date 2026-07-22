import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { canReadCashImportStaging, canWriteCashImportStaging } from "@/lib/cash-import-staging/access";
import { listCashImportBatchesForActiveTenant } from "@/lib/cash-import-staging/service";
import { AccessDenied } from "./AccessDenied";
import { BatchList } from "./BatchList";
import { StagingBanner } from "./StagingBanner";
import { UploadBatchForm } from "./UploadBatchForm";

// Continues Gate 1J-A's dry-run-only parser into real tenant-safe staging
// (Gate 1J-B) — this route now lists + creates staged batches rather than
// rendering an ephemeral, unsaved preview. Admin can upload; owner can only
// read (LOCK: "Owner hanya boleh membaca... tidak boleh mengubah mapping").
export default async function CashImportStagingPage() {
  const context = await requireTenantContext();
  const canRead = canReadCashImportStaging(context.roles);
  const canWrite = canWriteCashImportStaging(context.roles);

  if (!canRead) {
    return (
      <AppShell title="Import Data — Laporan Kas" sectionLabel="Manajemen Data">
        <AccessDenied />
      </AppShell>
    );
  }

  const batches = await listCashImportBatchesForActiveTenant();

  return (
    <AppShell title="Import Data — Laporan Kas" sectionLabel="Manajemen Data" showMobileTitle={false}>
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data — Laporan Kas</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {canWrite
            ? "Unggah, petakan label kapal, dan siapkan batch untuk review."
            : "Tampilan baca-saja — hanya Admin yang dapat mengunggah dan mengubah mapping."}
        </p>
      </div>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <StagingBanner />
        {canWrite ? <UploadBatchForm /> : null}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Batch Import Tenant Ini</h2>
          <BatchList batches={batches} />
        </section>
      </main>
    </div>
    </AppShell>
  );
}
