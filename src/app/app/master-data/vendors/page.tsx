import { requireTenantContext } from "@/lib/auth/tenant";
import { listVendorsForActiveTenant } from "@/lib/master-data/vendors/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { VendorCreateForm } from "./VendorCreateForm";
import { VendorRow } from "./VendorRow";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");
  const vendors = await listVendorsForActiveTenant(q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Vendors</h2>
        <SearchForm placeholder="Cari nama vendor..." defaultValue={q} />
      </div>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Vendor">
          <VendorCreateForm />
        </CollapsibleCreatePanel>
      ) : null}

      {vendors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada vendor yang cocok dengan pencarian." : "Belum ada vendor. Tambahkan vendor pertama Anda."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vendors.map((vendor) => (
            <VendorRow key={vendor.id} vendor={vendor} canMutate={canMutate} />
          ))}
        </ul>
      )}
    </div>
  );
}
