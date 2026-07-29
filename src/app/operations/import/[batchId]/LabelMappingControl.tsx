"use client";

import { useActionState, useState } from "react";
import {
  autoApplyCashImportBatchDispositionsAction,
  setCashImportLabelMappingAction,
  type AutoApplyCashImportBatchDispositionsActionResult,
} from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import type { CashImportLabelSummary } from "@/lib/cash-import-staging/label-summary";
import type { CashImportMappingKind } from "@/lib/cash-import-staging/types";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import type { ServiceTypeRow } from "@/lib/master-data/service-types/repository";
import type { FacilityLocationRow } from "@/lib/master-data/facility-locations/repository";
import { FormError } from "@/components/master-data/FormError";
import { inputClassName, selectClassName } from "@/components/master-data/fields";

const initialState: CashImportStagingActionResult = {};
const initialAutoApplyState: AutoApplyCashImportBatchDispositionsActionResult = {};

const MAPPING_LABEL: Record<CashImportMappingKind, string> = {
  cash: "Kas",
  existing_vessel_project: "Project Kapal Existing",
  new_project_candidate: "Kandidat Project Baru",
  shared_overhead: "Overhead Bersama",
  unresolved: "Belum Terselesaikan",
};

export function LabelMappingControl({
  batchId,
  label,
  vesselProjects,
  clients,
  serviceTypes,
  facilityLocations,
  defaultStartDate,
  canWrite,
}: {
  batchId: string;
  label: CashImportLabelSummary;
  vesselProjects: VesselProjectRow[];
  clients: ClientRow[];
  serviceTypes: ServiceTypeRow[];
  facilityLocations: FacilityLocationRow[];
  defaultStartDate: string;
  canWrite: boolean;
}) {
  const [state, formAction, isPending] = useActionState(setCashImportLabelMappingAction, initialState);
  const [autoApplyState, autoApplyFormAction, autoApplyPending] = useActionState(
    autoApplyCashImportBatchDispositionsAction,
    initialAutoApplyState,
  );
  const [mappingKind, setMappingKind] = useState<CashImportMappingKind>(label.mappingKind ?? label.suggestedMappingKind);
  const [projectId, setProjectId] = useState(label.mappedVesselProjectId ?? "");
  const plan = label.candidatePlan;

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label.vesselLabel ?? "(Tanpa Label)"}</p>
          <p className="text-xs text-neutral-500">{label.rowCount} baris</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Saran: {MAPPING_LABEL[label.suggestedMappingKind]}</span>
          {canWrite ? (
            <form action={autoApplyFormAction}>
              <input type="hidden" name="batchId" value={batchId} />
              <input type="hidden" name="vesselLabel" value={label.vesselLabel ?? ""} />
              <input type="hidden" name="scopeToLabel" value="true" />
              <button
                type="submit"
                disabled={autoApplyPending}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
              >
                {autoApplyPending ? "Memproses..." : "Terapkan Otomatis ke Baris Label Ini"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {canWrite ? (
        <form action={formAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="vesselLabel" value={label.vesselLabel ?? ""} />
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="mappingKind"
              value={mappingKind}
              onChange={(event) => setMappingKind(event.target.value as CashImportMappingKind)}
              aria-label="Jenis mapping"
              className={`${selectClassName} px-2 py-1 text-xs`}
            >
              {(Object.entries(MAPPING_LABEL) as Array<[CashImportMappingKind, string]>).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
            {mappingKind === "existing_vessel_project" ? (
              <select
                name="mappedVesselProjectId"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                aria-label="Project Kapal tujuan"
                className={`${selectClassName} px-2 py-1 text-xs`}
              >
                <option value="">Pilih Project Kapal...</option>
                {vesselProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_code ?? project.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md border border-neutral-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-neutral-700"
            >
              {isPending ? "Menyimpan..." : "Simpan Mapping"}
            </button>
          </div>

          {mappingKind === "new_project_candidate" ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50/40 p-2 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                Project Draft akan dibuat saat import disetujui.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  name="candidateVesselName"
                  defaultValue={plan?.vessel_name ?? label.vesselLabel ?? ""}
                  placeholder="Nama kapal"
                  aria-label="Nama kapal kandidat"
                  className={`${inputClassName} h-auto px-2 py-1 text-xs`}
                />
                <select
                  name="candidateClientId"
                  defaultValue={plan?.client_id ?? ""}
                  aria-label="Client"
                  className={`${selectClassName} px-2 py-1 text-xs`}
                >
                  <option value="">Pilih Client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.display_name}
                    </option>
                  ))}
                </select>
                <select
                  name="candidateServiceTypeId"
                  defaultValue={plan?.service_type_id ?? ""}
                  aria-label="Service Type"
                  className={`${selectClassName} px-2 py-1 text-xs`}
                >
                  <option value="">Pilih Service Type...</option>
                  {serviceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </option>
                  ))}
                </select>
                <select
                  name="candidateFacilityLocationId"
                  defaultValue={plan?.facility_location_id ?? ""}
                  aria-label="Facility Location (opsional)"
                  className={`${selectClassName} px-2 py-1 text-xs`}
                >
                  <option value="">Facility (opsional)...</option>
                  {facilityLocations.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  name="candidateStartDate"
                  defaultValue={plan?.start_date ?? defaultStartDate}
                  aria-label="Tanggal mulai"
                  className={`${inputClassName} h-auto px-2 py-1 text-xs`}
                />
              </div>
            </div>
          ) : null}
        </form>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          Mapping saat ini: {label.mappingKind ? MAPPING_LABEL[label.mappingKind] : "Belum dipetakan"}
        </p>
      )}
      <FormError error={state.error} />
      {autoApplyState.result ? (
        <p className="mt-1 text-xs text-neutral-500">
          {autoApplyState.result.auto_included_count ?? 0} baris di-include, {autoApplyState.result.manual_review_count ?? 0}{" "}
          baris perlu tinjauan manual.
        </p>
      ) : null}
      <FormError error={autoApplyState.error} />
    </li>
  );
}
