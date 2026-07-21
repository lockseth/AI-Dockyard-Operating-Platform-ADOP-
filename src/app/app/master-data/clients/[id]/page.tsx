import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/auth/tenant";
import { getClientForActiveTenant } from "@/lib/master-data/clients/service";
import { computeClientBillingReadiness } from "@/lib/master-data/clients/billing-readiness";
import { listContactsForClient } from "@/lib/master-data/client-contacts/service";
import { listVesselsForClient } from "@/lib/master-data/vessels/service";
import { StatusBadge } from "@/components/master-data/StatusBadge";
import { StatusToggleForm } from "@/components/master-data/StatusToggleForm";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { VesselRow } from "@/components/master-data/VesselRow";
import { setClientStatusAction } from "@/lib/master-data/clients/actions";
import { ClientEditForm } from "./ClientEditForm";
import { ContactCreateForm } from "./ContactCreateForm";
import { ContactRow } from "./ContactRow";
import { VesselCreateForm } from "./VesselCreateForm";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  const client = await getClientForActiveTenant(id);
  if (!client) {
    notFound();
  }

  const [contacts, vessels] = await Promise.all([
    listContactsForClient(client.id),
    listVesselsForClient(client.id),
  ]);
  const billingReadiness = computeClientBillingReadiness(client, contacts);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/app/master-data/clients"
            className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            &larr; Kembali ke daftar client
          </Link>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{client.display_name}</h2>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={client.status} />
          {canMutate ? (
            <StatusToggleForm id={client.id} currentStatus={client.status} action={setClientStatusAction} />
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-neutral-500">Billing Readiness</h3>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              billingReadiness.status === "READY"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                : billingReadiness.status === "BLOCKED"
                  ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            }`}
          >
            {billingReadiness.status}
          </span>
          {billingReadiness.missing.length > 0 ? (
            <ul className="list-disc pl-4 text-xs text-neutral-500">
              {billingReadiness.missing.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <span className="text-xs text-neutral-500">Semua syarat billing terpenuhi.</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-500">Identitas Client</h3>
        {canMutate ? (
          <ClientEditForm client={client} />
        ) : (
          <dl className="grid gap-3 rounded-lg border border-neutral-200 p-4 text-sm sm:grid-cols-2 dark:border-neutral-800">
            <Row label="Kode Client" value={client.client_code} />
            <Row label="Nama Legal" value={client.legal_name} />
            <Row label="NPWP / Tax ID" value={client.tax_identifier} />
            <Row label="Alamat / Billing Address" value={client.address} />
            <Row
              label="Jangka Waktu Pembayaran Default"
              value={client.default_payment_term_days ? `${client.default_payment_term_days} hari` : null}
            />
            <Row label="Preferensi Pengiriman Invoice" value={client.invoice_delivery_preference} />
          </dl>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-500">PIC / Contact</h3>
        {contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Belum ada PIC untuk client ini.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <ContactRow key={contact.id} contact={contact} clientId={client.id} canMutate={canMutate} />
            ))}
          </ul>
        )}
        {canMutate ? (
          <CollapsibleCreatePanel label="Tambah PIC">
            <ContactCreateForm clientId={client.id} />
          </CollapsibleCreatePanel>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-500">Kapal Milik Client</h3>
        {vessels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Belum ada kapal untuk client ini.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {vessels.map((vessel) => (
              <VesselRow key={vessel.id} vessel={vessel} canMutate={canMutate} />
            ))}
          </ul>
        )}
        {canMutate ? (
          <CollapsibleCreatePanel label="Tambah Kapal">
            <VesselCreateForm clientId={client.id} />
          </CollapsibleCreatePanel>
        ) : null}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-medium">{value ?? "-"}</dd>
    </div>
  );
}
