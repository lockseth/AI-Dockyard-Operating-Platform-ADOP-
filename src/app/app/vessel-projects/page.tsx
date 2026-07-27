import { requireTenantContext } from "@/lib/auth/tenant";
import { listVesselProjectsForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { listServiceTypesForActiveTenant } from "@/lib/master-data/service-types/service";
import { listFacilityLocationsForActiveTenant } from "@/lib/master-data/facility-locations/service";
import { CollapsibleCreatePanel } from "@/components/master-data/CollapsibleCreatePanel";
import { TextLink } from "@/components/ui/TextLink";
import { AppShell } from "@/components/shell/AppShell";
import { VesselProjectCreateForm } from "./VesselProjectCreateForm";
import { getVesselProjectLifecycleStatusLabel, getVesselProjectPriorityLabel } from "@/lib/vessel-projects/labels";

export default async function VesselProjectsPage() {
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  const [projects, vessels, clients, serviceTypes, facilityLocations] = await Promise.all([
    listVesselProjectsForActiveTenant(),
    listVesselsForActiveTenant(),
    listClientsForActiveTenant(),
    listServiceTypesForActiveTenant(),
    listFacilityLocationsForActiveTenant(),
  ]);

  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));
  const clientNameById = new Map(clients.map((client) => [client.id, client.display_name]));

  return (
    <AppShell title="Project Kapal" sectionLabel="Operasional" showMobileTitle={false}>
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Kapal</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Daftar Project Kapal beserta vessel, client, service type, dan status lifecycle.
        </p>
      </div>

      {canMutate ? (
        <CollapsibleCreatePanel label="Tambah Project Kapal">
          <VesselProjectCreateForm
            vesselOptions={vessels
              .filter((vessel) => vessel.status === "active")
              .map((vessel) => ({ value: vessel.id, label: vessel.vessel_name }))}
            clientOptions={clients
              .filter((client) => client.status === "active")
              .map((client) => ({ value: client.id, label: client.display_name }))}
            serviceTypeOptions={serviceTypes
              .filter((serviceType) => serviceType.status === "active")
              .map((serviceType) => ({ value: serviceType.id, label: serviceType.name }))}
            facilityLocationOptions={facilityLocations
              .filter((location) => location.status === "active")
              .map((location) => ({ value: location.id, label: location.name }))}
          />
        </CollapsibleCreatePanel>
      ) : null}

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Belum ada Project Kapal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-4 py-3">Kapal</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Kode Project</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-4 py-3 font-medium">{vesselNameById.get(project.vessel_id) ?? "-"}</td>
                  <td className="px-4 py-3 text-neutral-500">{clientNameById.get(project.client_id) ?? "-"}</td>
                  <td className="px-4 py-3 text-neutral-500">{project.project_code ?? "-"}</td>
                  <td className="px-4 py-3 text-neutral-500">{getVesselProjectPriorityLabel(project.priority)}</td>
                  <td className="px-4 py-3">{getVesselProjectLifecycleStatusLabel(project.lifecycle_status)}</td>
                  <td className="px-4 py-3 text-right">
                    <TextLink href={`/app/vessel-projects/${project.id}`} className="text-xs font-medium">
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
    </AppShell>
  );
}
