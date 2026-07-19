import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logMasterDataAuditEvent } from "../shared/audit";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import { getClientById } from "../clients/repository";
import type { MasterDataActionResult } from "../clients/service";
import {
  getVesselById,
  insertVessel,
  listVessels,
  listVesselsByClient,
  updateVesselRow,
  type VesselRow,
} from "./repository";
import type { CreateVesselInput, UpdateVesselInput } from "./validation";

export interface CreateVesselResult extends MasterDataActionResult {
  id?: string;
}

export async function listVesselsForActiveTenant(search?: string): Promise<VesselRow[]> {
  const context = await requireTenantContext();
  return listVessels(context.tenantId, search);
}

export async function listVesselsForClient(clientId: string): Promise<VesselRow[]> {
  const context = await requireTenantContext();
  return listVesselsByClient(context.tenantId, clientId);
}

export async function getVesselForActiveTenant(id: string): Promise<VesselRow | null> {
  const context = await requireTenantContext();
  return getVesselById(context.tenantId, id);
}

export async function createVessel(input: CreateVesselInput): Promise<CreateVesselResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const client = await getClientById(context.tenantId, input.clientId);
  if (!client) {
    return { error: "Client tidak ditemukan." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await insertVessel({
    tenant_id: context.tenantId,
    client_id: input.clientId,
    created_by: context.userId,
    vessel_code: input.vesselCode ?? null,
    vessel_name: input.vesselName,
    registration_number: input.registrationNumber ?? null,
    vessel_type: input.vesselType ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vessel",
    entityId: data.id,
    action: "create",
    afterData: data,
  });

  return { id: data.id };
}

export async function updateVessel(id: string, input: UpdateVesselInput): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getVesselById(context.tenantId, id);
  if (!before) {
    return { error: "Kapal tidak ditemukan." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateVesselRow(context.tenantId, id, {
    vessel_code: input.vesselCode ?? null,
    vessel_name: input.vesselName,
    registration_number: input.registrationNumber ?? null,
    vessel_type: input.vesselType ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vessel",
    entityId: id,
    action: "update",
    beforeData: before,
    afterData: data,
  });

  return {};
}

export async function setVesselStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getVesselById(context.tenantId, id);
  if (!before) {
    return { error: "Kapal tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateVesselRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vessel",
    entityId: id,
    action: status === "active" ? "activate" : "deactivate",
    beforeData: before,
    afterData: data,
  });

  return {};
}
