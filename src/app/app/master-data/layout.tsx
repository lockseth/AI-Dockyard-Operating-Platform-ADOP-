import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";

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
    <AppShell title="Master Data">
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <nav className="flex flex-wrap gap-2 text-sm">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md border border-neutral-200 px-3 py-1.5 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
          >
            {item.label}
          </Link>
        ))}
      </nav>

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
