"use client";

import { useActionState, useState } from "react";
import { setCashImportLabelMappingAction } from "@/lib/cash-import-staging/actions";
import type { CashImportStagingActionResult } from "@/lib/cash-import-staging/service";
import type { CashImportLabelSummary } from "@/lib/cash-import-staging/label-summary";
import type { CashImportMappingKind } from "@/lib/cash-import-staging/types";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import { FormError } from "@/components/master-data/FormError";
import { inputClassName } from "@/components/master-data/fields";

const initialState: CashImportStagingActionResult = {};

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
  canWrite,
}: {
  batchId: string;
  label: CashImportLabelSummary;
  vesselProjects: VesselProjectRow[];
  canWrite: boolean;
}) {
  const [state, formAction, isPending] = useActionState(setCashImportLabelMappingAction, initialState);
  const [mappingKind, setMappingKind] = useState<CashImportMappingKind>(label.mappingKind ?? label.suggestedMappingKind);
  const [projectId, setProjectId] = useState(label.mappedVesselProjectId ?? "");

  return (
    <li className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label.vesselLabel ?? "(Tanpa Label)"}</p>
          <p className="text-xs text-neutral-500">{label.rowCount} baris</p>
        </div>
        <span className="text-xs text-neutral-500">Saran: {MAPPING_LABEL[label.suggestedMappingKind]}</span>
      </div>

      {canWrite ? (
        <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="vesselLabel" value={label.vesselLabel ?? ""} />
          <select
            name="mappingKind"
            value={mappingKind}
            onChange={(event) => setMappingKind(event.target.value as CashImportMappingKind)}
            aria-label="Jenis mapping"
            className={`${inputClassName} px-2 py-1 text-xs`}
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
              className={`${inputClassName} px-2 py-1 text-xs`}
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
        </form>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          Mapping saat ini: {label.mappingKind ? MAPPING_LABEL[label.mappingKind] : "Belum dipetakan"}
        </p>
      )}
      <FormError error={state.error} />
    </li>
  );
}
