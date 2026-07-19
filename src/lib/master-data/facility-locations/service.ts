import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import type { MasterDataActionResult } from "../clients/service";
import {
  getFacilityLocationById,
  insertFacilityLocation,
  listFacilityLocations,
  updateFacilityLocationRow,
  type FacilityLocationRow,
} from "./repository";
import type { FacilityLocationInput } from "./validation";

export interface CreateFacilityLocationResult extends MasterDataActionResult {
  id?: string;
}

export async function listFacilityLocationsForActiveTenant(search?: string): Promise<FacilityLocationRow[]> {
  const context = await requireTenantContext();
  return listFacilityLocations(context.tenantId, search);
}

export async function createFacilityLocation(input: FacilityLocationInput): Promise<CreateFacilityLocationResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await insertFacilityLocation({
    tenant_id: context.tenantId,
    code: input.code ?? null,
    name: input.name,
    description: input.description ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return { id: data.id };
}

export async function updateFacilityLocation(
  id: string,
  input: FacilityLocationInput,
): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getFacilityLocationById(context.tenantId, id);
  if (!before) {
    return { error: "Lokasi fasilitas tidak ditemukan." };
  }

  const { data, error } = await updateFacilityLocationRow(context.tenantId, id, {
    code: input.code ?? null,
    name: input.name,
    description: input.description ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}

export async function setFacilityLocationStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getFacilityLocationById(context.tenantId, id);
  if (!before) {
    return { error: "Lokasi fasilitas tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const { data, error } = await updateFacilityLocationRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}
