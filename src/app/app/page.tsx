import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";

export default async function AppPage() {
  const context = await requireTenantContext();
  const canAccessDailyOperations = context.roles.some((role) => role === "owner" || role === "admin");
  const canAccessOwnerControl = context.roles.includes("owner");
  const canAccessCashImport = context.roles.includes("admin");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Foundation Workspace
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">ADOP</h1>
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

      <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <dl className="grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Pengguna</dt>
            <dd className="font-medium">{context.email ?? context.userId}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Tenant Aktif</dt>
            <dd className="font-medium">{context.tenantDisplayName}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium">{context.roles.join(", ") || "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">Master Data</h2>
        <p className="mt-2 text-sm text-neutral-500">
          Kelola client, kapal, vendor, service type, lokasi fasilitas, dan kategori biaya.
        </p>
        <Link
          href="/app/master-data/clients"
          className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Buka Master Data
        </Link>
      </section>

      {canAccessDailyOperations ? (
        <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-500">Operasional Harian</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Buka kas, catat pengeluaran, dan kirim rekonsiliasi akhir hari.
          </p>
          <Link
            href="/operations/daily"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Buka Operasional Harian
          </Link>
        </section>
      ) : null}

      {canAccessCashImport ? (
        <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-500">Import Data</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Analisis file laporan kas lama (.xlsx) — dry-run preview, belum ada data yang disimpan.
          </p>
          <Link
            href="/operations/import"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Buka Import Data
          </Link>
        </section>
      ) : null}

      {canAccessOwnerControl ? (
        <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-500">Owner Control</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Review pengajuan biaya, kandidat duplikasi, dan persetujuan rekonsiliasi akhir hari.
          </p>
          <Link
            href="/owner/control"
            className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Buka Owner Control
          </Link>
        </section>
      ) : null}

      <section className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-500">
          Legal Entity Terbaca
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {context.legalEntities.length === 0 ? (
            <li className="text-neutral-400">Belum ada legal entity.</li>
          ) : (
            context.legalEntities.map((entity) => (
              <li key={entity.id}>{entity.displayName}</li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
