"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  createVesselProject,
  setVesselProjectPriorityForActiveTenant,
  transitionVesselProject,
  type CreateVesselProjectResult,
  type VesselProjectActionResult,
} from "./service";

const VESSEL_PROJECTS_PATH = "/app/vessel-projects";

// Mirrors src/lib/operations-daily/actions.ts's mapThrown convention —
// tenant_id/actor are re-derived server-side inside service.ts, never read
// from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

function optionalField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export async function createVesselProjectAction(
  _prevState: CreateVesselProjectResult,
  formData: FormData,
): Promise<CreateVesselProjectResult> {
  let result: CreateVesselProjectResult;
  try {
    result = await createVesselProject({
      vesselId: formData.get("vesselId"),
      clientId: formData.get("clientId"),
      serviceTypeId: formData.get("serviceTypeId"),
      facilityLocationId: optionalField(formData, "facilityLocationId"),
      projectCode: optionalField(formData, "projectCode"),
      startDate: formData.get("startDate"),
      priority: formData.get("priority"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(VESSEL_PROJECTS_PATH);
  }
  return result;
}

export async function transitionVesselProjectAction(
  _prevState: VesselProjectActionResult,
  formData: FormData,
): Promise<VesselProjectActionResult> {
  const id = formData.get("id");
  let result: VesselProjectActionResult;
  try {
    result = await transitionVesselProject({
      id,
      toStatus: formData.get("toStatus"),
      reason: optionalField(formData, "reason"),
      facilityLocationId: optionalField(formData, "facilityLocationId"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(VESSEL_PROJECTS_PATH);
    if (typeof id === "string") {
      revalidatePath(`${VESSEL_PROJECTS_PATH}/${id}`);
    }
  }
  return result;
}

export async function setVesselProjectPriorityAction(
  _prevState: VesselProjectActionResult,
  formData: FormData,
): Promise<VesselProjectActionResult> {
  const id = formData.get("id");
  let result: VesselProjectActionResult;
  try {
    result = await setVesselProjectPriorityForActiveTenant({
      id,
      priority: formData.get("priority"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(VESSEL_PROJECTS_PATH);
    if (typeof id === "string") {
      revalidatePath(`${VESSEL_PROJECTS_PATH}/${id}`);
    }
  }
  return result;
}
