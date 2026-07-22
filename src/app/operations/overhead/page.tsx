import { requireTenantContext } from "@/lib/auth/tenant";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/Card";
import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { buildAllocatableVesselProjectOptions, buildVesselProjectLabelMap } from "@/lib/operations-daily/view-model";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import {
  listSharedOverheadAllocationsForActiveTenant,
  listSharedOverheadAllocationStatusForActiveTenant,
} from "@/lib/shared-overhead-allocation/service";
import { AccessDenied } from "./AccessDenied";
import { OverheadEntryRow } from "./OverheadEntryRow";

export default async function SharedOverheadPoolPage() {
  const context = await requireTenantContext();

  if (!canAccessDailyOperations(context.roles)) {
    return (
      <AppShell title="Biaya Bersama/Overhead" sectionLabel="Operasional">
        <AccessDenied />
      </AppShell>
    );
  }

  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  const [entries, allocations, projects, vessels] = await Promise.all([
    listSharedOverheadAllocationStatusForActiveTenant(),
    listSharedOverheadAllocationsForActiveTenant(),
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
  ]);

  const projectOptions = buildAllocatableVesselProjectOptions(projects, vessels);
  const projectLabelById = buildVesselProjectLabelMap(projects, vessels);

  const allocationsByEntryId = new Map<string, typeof allocations>();
  for (const allocation of allocations) {
    const key = allocation.overhead_entry_id ?? "";
    const existing = allocationsByEntryId.get(key);
    if (existing) {
      existing.push(allocation);
    } else {
      allocationsByEntryId.set(key, [allocation]);
    }
  }

  return (
    <AppShell title="Biaya Bersama/Overhead" sectionLabel="Operasional">
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Biaya Bersama/Overhead</h1>
          <p className="mt-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Biaya bersama tidak melekat pada satu Project Kapal saat dicatat. Sebelum Project Close, biaya bersama
            yang berlaku pada periode project tersebut wajib dialokasikan penuh.
          </p>
        </div>

        <Card>
          <h2 className="text-base font-bold">Daftar Biaya Bersama/Overhead</h2>

          {entries.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              Belum ada Biaya Bersama/Overhead yang tercatat.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {entries.map((entry) => (
                <OverheadEntryRow
                  key={entry.overhead_entry_id}
                  entry={entry}
                  allocations={allocationsByEntryId.get(entry.overhead_entry_id ?? "") ?? []}
                  projectOptions={projectOptions}
                  projectLabelById={projectLabelById}
                  canMutate={canMutate}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
