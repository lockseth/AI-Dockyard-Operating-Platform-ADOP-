import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { SearchForm } from "@/components/master-data/SearchForm";
import { VesselRow } from "@/components/master-data/VesselRow";
import { TextLink } from "@/components/ui/TextLink";

// Matches Button's variant="secondary" size="sm" look — Button itself only
// renders a native <button>, so a real navigable <Link> is styled to match
// rather than nesting an <a> inside a <button>.
const SECONDARY_SM_LINK_CLASSNAME =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] border-[1.5px] border-neutral-300 bg-white px-3 text-[12.5px] font-semibold text-brand-navy outline-none transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 active:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

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
        <TextLink href="/app/master-data/clients" className="text-xs">
          buka daftar client
        </TextLink>
        .
      </p>

      {vessels.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          <p>
            {q
              ? "Tidak ada kapal yang cocok dengan pencarian."
              : "Belum ada kapal terdaftar. Buka client pemiliknya lalu tambahkan kapal dari sana."}
          </p>
          {!q ? (
            <Link href="/app/master-data/clients" className={SECONDARY_SM_LINK_CLASSNAME}>
              Buka Daftar Client
            </Link>
          ) : null}
        </div>
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
