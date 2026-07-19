import { redirect } from "next/navigation";
import { getAccessibleTenants } from "@/lib/auth/tenant";
import { SelectTenantForm } from "./SelectTenantForm";

// Only reachable when the caller has more than one active membership —
// requireTenantContext() sends single-membership callers to /tenant/resolve
// instead, and zero-membership callers to /no-access. Re-checked here too,
// since this page can be requested directly.
export default async function SelectTenantPage() {
  const memberships = await getAccessibleTenants();

  if (memberships.length === 0) {
    redirect("/no-access");
  }

  if (memberships.length === 1) {
    redirect("/tenant/resolve");
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          Pilih Tenant
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Anda memiliki akses ke beberapa tenant
        </h1>
      </div>
      <SelectTenantForm memberships={memberships} />
    </main>
  );
}
