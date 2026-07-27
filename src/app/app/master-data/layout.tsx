import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { MasterDataNav } from "@/components/master-data/MasterDataNav";

const NAV_ITEMS = [
  { href: "/app/master-data/clients", label: "Clients" },
  { href: "/app/master-data/vessels", label: "Vessels" },
  { href: "/app/master-data/vendors", label: "Vendors" },
  { href: "/app/master-data/service-types", label: "Service Types" },
  { href: "/app/master-data/facility-locations", label: "Facility Locations" },
  { href: "/app/master-data/expense-categories", label: "Expense Categories" },
];

export default async function MasterDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  return (
    <AppShell title="Master Data" sectionLabel="Manajemen Data" showMobileTitle={false}>
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Master Data</h1>
      <MasterDataNav items={NAV_ITEMS} />

      {!canMutate ? (
        <p className="text-xs text-neutral-500">
          Anda memiliki akses baca saja (read-only) pada master data ini.
        </p>
      ) : null}

      <main className="flex flex-1 flex-col gap-6 pb-16">{children}</main>
    </div>
    </AppShell>
  );
}
