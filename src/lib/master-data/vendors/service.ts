import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logMasterDataAuditEvent } from "../shared/audit";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import type { MasterDataActionResult } from "../clients/service";
import { getVendorById, insertVendor, listVendors, updateVendorRow, type VendorRow } from "./repository";
import type { VendorInput } from "./validation";

export interface CreateVendorResult extends MasterDataActionResult {
  id?: string;
}

export async function listVendorsForActiveTenant(search?: string): Promise<VendorRow[]> {
  const context = await requireTenantContext();
  return listVendors(context.tenantId, search);
}

export async function createVendor(input: VendorInput): Promise<CreateVendorResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await insertVendor({
    tenant_id: context.tenantId,
    created_by: context.userId,
    vendor_code: input.vendorCode ?? null,
    display_name: input.displayName,
    contact_name: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vendor",
    entityId: data.id,
    action: "create",
    afterData: data,
  });

  return { id: data.id };
}

export async function updateVendor(id: string, input: VendorInput): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getVendorById(context.tenantId, id);
  if (!before) {
    return { error: "Vendor tidak ditemukan." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateVendorRow(context.tenantId, id, {
    vendor_code: input.vendorCode ?? null,
    display_name: input.displayName,
    contact_name: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vendor",
    entityId: id,
    action: "update",
    beforeData: before,
    afterData: data,
  });

  return {};
}

export async function setVendorStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getVendorById(context.tenantId, id);
  if (!before) {
    return { error: "Vendor tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await updateVendorRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  await logMasterDataAuditEvent(supabase, {
    tenantId: context.tenantId,
    entityType: "vendor",
    entityId: id,
    action: status === "active" ? "activate" : "deactivate",
    beforeData: before,
    afterData: data,
  });

  return {};
}
