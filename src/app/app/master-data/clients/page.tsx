import { requireTenantContext } from "@/lib/auth/tenant";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { SearchForm } from "@/components/master-data/SearchForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { TextLink } from "@/components/ui/TextLink";
import { ClientCreateForm } from "./ClientCreateForm";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");
  const clients = await listClientsForActiveTenant(q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Clients</h2>
        <SearchForm placeholder="Cari nama client..." defaultValue={q} />
      </div>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Client">
          <ClientCreateForm />
        </CollapsibleCreatePanel>
      ) : null}

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {q ? "Tidak ada client yang cocok dengan pencarian." : "Belum ada client. Tambahkan client pertama Anda."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3">Nama Client</th>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-4 py-3 font-medium">{client.display_name}</td>
                  <td className="px-4 py-3 text-neutral-500">{client.client_code ?? "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TextLink href={`/app/master-data/clients/${client.id}`} className="text-xs font-medium">
                      Lihat detail
                    </TextLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
