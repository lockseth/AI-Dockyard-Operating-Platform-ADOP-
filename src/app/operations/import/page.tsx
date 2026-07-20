import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";
import { branding } from "@/lib/branding";
import { canAccessCashImport } from "@/lib/cash-import/access";
import { AccessDenied } from "./AccessDenied";
import { ImportAnalyzeForm } from "./ImportAnalyzeForm";

export default async function CashImportPage() {
  const context = await requireTenantContext();

  if (!canAccessCashImport(context.roles)) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {branding.productName} {branding.brandedBy}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Import Data — Laporan Kas</h1>
          <p className="text-sm text-neutral-500">Parser dan preview. Belum ada data yang disimpan pada gate ini.</p>
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
        <ImportAnalyzeForm />
      </main>
    </div>
  );
}
