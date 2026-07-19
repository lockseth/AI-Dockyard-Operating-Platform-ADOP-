import { requireTenantContext } from "@/lib/auth/tenant";
import { listFacilityLocationsForActiveTenant } from "@/lib/master-data/facility-locations/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { FacilityLocationCreateForm } from "./FacilityLocationCreateForm";
import { FacilityLocationRow } from "./FacilityLocationRow";

export default async function FacilityLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");
  const locations = await listFacilityLocationsForActiveTenant(q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Facility Locations</h2>
        <SearchForm placeholder="Cari nama lokasi..." defaultValue={q} />
      </div>

      <p className="text-xs text-neutral-500">
        Daftar Gate/Dock/Pelabuhan/PLTU bersifat configurable — belum ada daftar baku, tambahkan sesuai
        kebutuhan tenant Anda.
      </p>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Lokasi Fasilitas">
          <FacilityLocationCreateForm />
        </CollapsibleCreatePanel>
      ) : null}

      {locations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada lokasi yang cocok dengan pencarian." : "Belum ada lokasi fasilitas."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {locations.map((location) => (
            <FacilityLocationRow key={location.id} location={location} canMutate={canMutate} />
          ))}
        </ul>
      )}
    </div>
  );
}
