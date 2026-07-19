import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logMasterDataAuditEvent } from "../shared/audit";
import { mapMasterDataError } from "../shared/errors";
import { normalizeWhatsappNumber } from "../shared/normalization";
import type { RecordStatus } from "../shared/types";
import { getClientById } from "../clients/repository";
import type { MasterDataActionResult } from "../clients/service";
import {
  getContactById,
  insertContact,
  listContactsByClient,
  updateContactRow,
  type ClientContactRow,
} from "./repository";
import type { CreateClientContactInput, UpdateClientContactInput } from "./validation";

export interface CreateClientContactResult extends MasterDataActionResult {
  id?: string;
}

export async function listContactsForClient(clientId: string): Promise<ClientContactRow[]> {
  const context = await requireTenantContext();
  return listContactsByClient(context.tenantId, clientId);
}

export async function createClientContact(input: CreateClientContactInput): Promise<CreateClientContactResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const client = await getClientById(context.tenantId, input.clientId);
  if (!client) {
    return { error: "Client tidak ditemukan." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await insertContact({
    tenant_id: context.tenantId,
    client_id: input.clientId,
    created_by: context.userId,
    full_name: input.fullName,
    position_department: input.positionDepartment ?? null,
    email: input.email ?? null,
    whatsapp_number: normalizeWhatsappNumber(input.whatsappNumber),
    is_primary: input.isPrimary,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "client_contact",
    entityId: data.id,
    action: "create",
    afterData: data,
  });

  return { id: data.id };
}

export async function updateClientContact(
  id: string,
  input: UpdateClientContactInput,
): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getContactById(context.tenantId, id);
  if (!before) {
    return { error: "PIC tidak ditemukan." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateContactRow(context.tenantId, id, {
    full_name: input.fullName,
    position_department: input.positionDepartment ?? null,
    email: input.email ?? null,
    whatsapp_number: normalizeWhatsappNumber(input.whatsappNumber),
    is_primary: input.isPrimary,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "client_contact",
    entityId: id,
    action: "update",
    beforeData: before,
    afterData: data,
  });

  return {};
}

export async function setClientContactStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getContactById(context.tenantId, id);
  if (!before) {
    return { error: "PIC tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateContactRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "client_contact",
    entityId: id,
    action: status === "active" ? "activate" : "deactivate",
    beforeData: before,
    afterData: data,
  });

  return {};
}
