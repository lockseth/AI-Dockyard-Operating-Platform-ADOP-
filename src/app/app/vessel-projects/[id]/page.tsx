import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantContext } from "@/lib/auth/tenant";
import { getVesselProjectForActiveTenant } from "@/lib/vessel-projects/service";
import { listVesselsForActiveTenant } from "@/lib/master-data/vessels/service";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import { listServiceTypesForActiveTenant } from "@/lib/master-data/service-types/service";
import { listFacilityLocationsForActiveTenant } from "@/lib/master-data/facility-locations/service";
import { getVesselProjectLifecycleStatusLabel, getVesselProjectPriorityLabel } from "@/lib/vessel-projects/labels";
import { AppShell } from "@/components/shell/AppShell";
import { LifecycleTransitionControl } from "./LifecycleTransitionControl";
import { PriorityControl } from "./PriorityControl";

export default async function VesselProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireTenantContext();
  const canMutate = context.roles.some((role) => role === "owner" || role === "admin");

  const [project, vessels, clients, serviceTypes, facilityLocations] = await Promise.all([
    getVesselProjectForActiveTenant(id),
    listVesselsForActiveTenant(),
    listClientsForActiveTenant(),
    listServiceTypesForActiveTenant(),
    listFacilityLocationsForActiveTenant(),
  ]);

  if (!project) {
    notFound();
  }

  const vesselName = vessels.find((vessel) => vessel.id === project.vessel_id)?.vessel_name ?? "-";
  const clientName = clients.find((client) => client.id === project.client_id)?.display_name ?? "-";
  const serviceTypeName = serviceTypes.find((serviceType) => serviceType.id === project.service_type_id)?.name ?? "-";
  const facilityLocationName =
    facilityLocations.find((location) => location.id === project.facility_location_id)?.name ?? "-";

  return (
    <AppShell title={vesselName}>
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <Link
          href="/app/vessel-projects"
          className="text-xs text-neutral-500 underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          &larr; Kembali ke Project Kapal
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {vesselName} {project.project_code ? `— ${project.project_code}` : ""}
        </h1>
        <p className="text-sm text-neutral-500">{getVesselProjectLifecycleStatusLabel(project.lifecycle_status)}</p>
      </div>

      <dl className="grid gap-3 rounded-lg border border-neutral-200 p-6 text-sm sm:grid-cols-2 dark:border-neutral-800">
        <DetailRow label="Kapal" value={vesselName} />
        <DetailRow label="Client" value={clientName} />
        <DetailRow label="Service Type" value={serviceTypeName} />
        <DetailRow label="Facility Location" value={facilityLocationName} />
        <DetailRow label="Priority" value={getVesselProjectPriorityLabel(project.priority)} />
        <DetailRow label="Kode Project" value={project.project_code ?? "-"} />
        <DetailRow label="Tanggal Mulai" value={project.start_date} />
        <DetailRow label="Siap Ditutup Sejak" value={project.ready_to_close_at ?? "-"} />
        <DetailRow label="Ditutup Sejak" value={project.closed_at ?? "-"} />
      </dl>

      {canMutate ? <PriorityControl projectId={project.id} currentPriority={project.priority} /> : null}
      {canMutate ? <LifecycleTransitionControl projectId={project.id} currentStatus={project.lifecycle_status} /> : null}
    </div>
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
