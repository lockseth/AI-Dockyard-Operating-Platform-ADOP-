import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapVesselProjectError } from "./errors";
import {
  getVesselProjectById,
  insertVesselProject,
  listVesselProjectCostSummary,
  listVesselProjects,
  transitionVesselProjectLifecycle,
  type VesselProjectCostSummaryRow,
  type VesselProjectRow,
} from "./repository";
import { createVesselProjectInputSchema, transitionVesselProjectInputSchema } from "./validation";

export interface VesselProjectActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface CreateVesselProjectResult extends VesselProjectActionResult {
  id?: string;
}

export async function listVesselProjectsForActiveTenant(): Promise<VesselProjectRow[]> {
  const context = await requireTenantContext();
  return listVesselProjects(context.tenantId);
}

export async function getVesselProjectForActiveTenant(id: string): Promise<VesselProjectRow | null> {
  const context = await requireTenantContext();
  return getVesselProjectById(context.tenantId, id);
}

export async function listVesselProjectCostSummaryForActiveTenant(): Promise<VesselProjectCostSummaryRow[]> {
  const context = await requireTenantContext();
  return listVesselProjectCostSummary(context.tenantId);
}

export async function createVesselProject(rawInput: unknown): Promise<CreateVesselProjectResult> {
  const parsed = createVesselProjectInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await insertVesselProject({
    tenant_id: context.tenantId,
    vessel_id: input.vesselId,
    client_id: input.clientId,
    service_type_id: input.serviceTypeId,
    facility_location_id: input.facilityLocationId,
    project_code: input.projectCode ?? null,
    start_date: input.startDate,
    created_by: context.userId,
  });

  if (error || !data) {
    return { error: mapVesselProjectError(error) };
  }

  return { id: data.id };
}

// Reason is optional and only ever recorded server-side via the transition
// RPC — this function never accepts or forges tenant_id, actor, or
// lifecycle timestamps; those are re-derived by the database (see the
// migration's transition_vessel_project_lifecycle function).
export async function transitionVesselProject(rawInput: unknown): Promise<VesselProjectActionResult> {
  const parsed = transitionVesselProjectInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, toStatus, reason } = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getVesselProjectById(context.tenantId, id);
  if (!before) {
    return { error: "Project tidak ditemukan." };
  }

  const { error } = await transitionVesselProjectLifecycle(id, toStatus, reason);
  if (error) {
    return { error: mapVesselProjectError(error) };
  }

  return {};
}
