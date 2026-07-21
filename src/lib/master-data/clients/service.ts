import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import { getClientById, insertClient, listClients, updateClientRow, type ClientRow } from "./repository";
import type { ClientInput } from "./validation";

export interface MasterDataActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface CreateClientResult extends MasterDataActionResult {
  id?: string;
}

export async function listClientsForActiveTenant(search?: string): Promise<ClientRow[]> {
  const context = await requireTenantContext();
  return listClients(context.tenantId, search);
}

export async function getClientForActiveTenant(id: string): Promise<ClientRow | null> {
  const context = await requireTenantContext();
  return getClientById(context.tenantId, id);
}

export async function createClient(input: ClientInput): Promise<CreateClientResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await insertClient({
    tenant_id: context.tenantId,
    created_by: context.userId,
    client_code: input.clientCode ?? null,
    display_name: input.displayName,
    legal_name: input.legalName ?? null,
    address: input.address ?? null,
    tax_identifier: input.taxIdentifier ?? null,
    default_payment_term_days: input.defaultPaymentTermDays ?? null,
    invoice_delivery_preference: input.invoiceDeliveryPreference ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return { id: data.id };
}

export async function updateClient(id: string, input: ClientInput): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getClientById(context.tenantId, id);
  if (!before) {
    return { error: "Client tidak ditemukan." };
  }

  const { data, error } = await updateClientRow(context.tenantId, id, {
    client_code: input.clientCode ?? null,
    display_name: input.displayName,
    legal_name: input.legalName ?? null,
    address: input.address ?? null,
    tax_identifier: input.taxIdentifier ?? null,
    default_payment_term_days: input.defaultPaymentTermDays ?? null,
    invoice_delivery_preference: input.invoiceDeliveryPreference ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}

export async function setClientStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getClientById(context.tenantId, id);
  if (!before) {
    return { error: "Client tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const { data, error } = await updateClientRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}
