import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";
import { branding } from "@/lib/branding";
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
    return <AccessDenied />;
  }

  const batches = await listCashImportBatchesForActiveTenant();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {branding.productName} {branding.brandedBy}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Import Data — Laporan Kas</h1>
          <p className="text-sm text-neutral-500">
            {canWrite
              ? "Unggah, petakan label kapal, dan siapkan batch untuk review."
              : "Tampilan baca-saja — hanya Admin yang dapat mengunggah dan mengubah mapping."}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="font-medium">{context.tenantDisplayName}</div>
            <div className="text-xs text-neutral-500">{context.roles.join(", ") || "-"}</div>
          </div>
          <Link
            href="/app"
            className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Workspace
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 pb-16">
        <StagingBanner />
        {canWrite ? <UploadBatchForm /> : null}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-neutral-500">Batch Import Tenant Ini</h2>
          <BatchList batches={batches} />
        </section>
      </main>
    </div>
  );
}
