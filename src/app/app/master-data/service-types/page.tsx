import { requireTenantContext } from "@/lib/auth/tenant";
import { listServiceTypesForActiveTenant } from "@/lib/master-data/service-types/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { ServiceTypeCreateForm } from "./ServiceTypeCreateForm";
import { ServiceTypeRow } from "./ServiceTypeRow";

export default async function ServiceTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");
  const serviceTypes = await listServiceTypesForActiveTenant(q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Service Types</h2>
        <SearchForm placeholder="Cari nama service type..." defaultValue={q} />
      </div>

      <p className="text-xs text-neutral-500">
        Emergency, Standard, Docking, dan PLTU adalah konfigurasi awal — tenant dapat menambahkan service
        type lain kapan saja.
      </p>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Service Type">
          <ServiceTypeCreateForm />
        </CollapsibleCreatePanel>
      ) : null}

      {serviceTypes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada service type yang cocok dengan pencarian." : "Belum ada service type."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {serviceTypes.map((serviceType) => (
            <ServiceTypeRow key={serviceType.id} serviceType={serviceType} canMutate={canMutate} />
          ))}
        </ul>
      )}
    </div>
  );
}
