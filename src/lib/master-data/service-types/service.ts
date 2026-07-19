import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import type { MasterDataActionResult } from "../clients/service";
import {
  getServiceTypeById,
  insertServiceType,
  listServiceTypes,
  updateServiceTypeRow,
  type ServiceTypeRow,
} from "./repository";
import type { ServiceTypeInput } from "./validation";

export interface CreateServiceTypeResult extends MasterDataActionResult {
  id?: string;
}

export async function listServiceTypesForActiveTenant(search?: string): Promise<ServiceTypeRow[]> {
  const context = await requireTenantContext();
  return listServiceTypes(context.tenantId, search);
}

export async function createServiceType(input: ServiceTypeInput): Promise<CreateServiceTypeResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await insertServiceType({
    tenant_id: context.tenantId,
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    sort_order: input.sortOrder,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return { id: data.id };
}

export async function updateServiceType(id: string, input: ServiceTypeInput): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getServiceTypeById(context.tenantId, id);
  if (!before) {
    return { error: "Service type tidak ditemukan." };
  }

  const { data, error } = await updateServiceTypeRow(context.tenantId, id, {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
    sort_order: input.sortOrder,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}

export async function setServiceTypeStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getServiceTypeById(context.tenantId, id);
  if (!before) {
    return { error: "Service type tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const { data, error } = await updateServiceTypeRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}
