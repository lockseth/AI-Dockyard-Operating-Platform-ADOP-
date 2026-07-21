import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppPage() {
  const context = await requireTenantContext();

  return (
    <AppShell title="Dashboard">
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
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
          <h2 className="text-sm font-medium text-neutral-500">Legal Entity Terbaca</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {context.legalEntities.length === 0 ? (
              <li className="text-neutral-400">Belum ada legal entity.</li>
            ) : (
              context.legalEntities.map((entity) => (
                <li key={entity.id}>{entity.legalName ?? entity.displayName}</li>
              ))
            )}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
