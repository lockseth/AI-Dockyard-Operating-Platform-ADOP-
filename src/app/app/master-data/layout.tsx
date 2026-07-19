import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { requireTenantContext } from "@/lib/auth/tenant";
import { branding } from "@/lib/branding";

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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {branding.productName} {branding.brandedBy}
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Master Data</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="font-medium">{context.tenantDisplayName}</div>
            <div className="text-xs text-neutral-500">{context.roles.join(", ") || "-"}</div>
          </div>
          <Link
            href="/app"
            className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Workspace
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Keluar
            </button>
          </form>
        </div>
      </header>

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
  );
}
