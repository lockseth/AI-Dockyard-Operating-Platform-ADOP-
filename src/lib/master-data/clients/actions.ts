"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { recordStatusSchema, idSchema } from "../shared/validation";
import type { MasterDataActionResult } from "./service";
import { createClient, setClientStatus, updateClient } from "./service";
import { clientInputSchema, parseClientFormData } from "./validation";

const CLIENTS_PATH = "/app/master-data/clients";

// Authorization is re-checked inside every service function via
// requireTenantRole() — this only turns that failure into a safe, generic
// message instead of an unhandled exception. Reviewer/viewer mutation stays
// fail-closed either way; this is UX polish on top of the real guard.
function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createClientAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseClientFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createClient(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error || !result.id) {
    return result;
  }

  revalidatePath(CLIENTS_PATH);
  redirect(`${CLIENTS_PATH}/${result.id}`);
}

export async function updateClientAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Client tidak valid." };
  }

  const parsed = clientInputSchema.safeParse({
    clientCode: formData.get("clientCode"),
    displayName: formData.get("displayName"),
    legalName: formData.get("legalName"),
    address: formData.get("address"),
    taxIdentifier: formData.get("taxIdentifier"),
    defaultPaymentTermDays: formData.get("defaultPaymentTermDays"),
    invoiceDeliveryPreference: formData.get("invoiceDeliveryPreference"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateClient(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(CLIENTS_PATH);
  redirect(`${CLIENTS_PATH}/${idParsed.data}`);
}

export async function setClientStatusAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  const statusParsed = recordStatusSchema.safeParse(formData.get("status"));
  if (!idParsed.success || !statusParsed.success) {
    return { error: "Permintaan tidak valid." };
  }

  let result: MasterDataActionResult;
  try {
    result = await setClientStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(CLIENTS_PATH);
  revalidatePath(`${CLIENTS_PATH}/${idParsed.data}`);
  return result;
}
