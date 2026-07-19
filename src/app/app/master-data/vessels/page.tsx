import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { VesselRow } from "@/components/master-data/VesselRow";

export default async function VesselsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  const [vessels, clients] = await Promise.all([
    listVesselsForActiveTenant(q),
    listClientsForActiveTenant(),
  ]);
  const clientNameById = new Map(clients.map((client) => [client.id, client.display_name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Vessels</h2>
        <SearchForm placeholder="Cari nama kapal..." defaultValue={q} />
      </div>

      <p className="text-xs text-neutral-500">
        Kapal ditambahkan dari halaman detail client pemiliknya —{" "}
        <Link href="/app/master-data/clients" className="underline underline-offset-4">
          buka daftar client
        </Link>
        .
      </p>

      {vessels.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada kapal yang cocok dengan pencarian." : "Belum ada kapal terdaftar."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vessels.map((vessel) => (
            <VesselRow
              key={vessel.id}
              vessel={vessel}
              canMutate={canMutate}
              clientLink={{
                href: `/app/master-data/clients/${vessel.client_id}`,
                label: clientNameById.get(vessel.client_id) ?? "Client",
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
