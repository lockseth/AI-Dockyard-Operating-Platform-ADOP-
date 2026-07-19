"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { idSchema, recordStatusSchema } from "../shared/validation";
import type { MasterDataActionResult } from "../clients/service";
import {
  createClientContact,
  setClientContactStatus,
  updateClientContact,
} from "./service";
import { parseCreateClientContactFormData, parseUpdateClientContactFormData } from "./validation";

function clientPath(clientId: string): string {
  return `/app/master-data/clients/${clientId}`;
}

function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createClientContactAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseCreateClientContactFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createClientContact(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(clientPath(parsed.data.clientId));
  redirect(clientPath(parsed.data.clientId));
}

export async function updateClientContactAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  const clientIdParsed = idSchema.safeParse(formData.get("clientId"));
  if (!idParsed.success || !clientIdParsed.success) {
    return { error: "PIC tidak valid." };
  }

  const parsed = parseUpdateClientContactFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateClientContact(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(clientPath(clientIdParsed.data));
  redirect(clientPath(clientIdParsed.data));
}

export async function setClientContactStatusAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  const clientIdParsed = idSchema.safeParse(formData.get("clientId"));
  const statusParsed = recordStatusSchema.safeParse(formData.get("status"));
  if (!idParsed.success || !clientIdParsed.success || !statusParsed.success) {
    return { error: "Permintaan tidak valid." };
  }

  let result: MasterDataActionResult;
  try {
    result = await setClientContactStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(clientPath(clientIdParsed.data));
  return result;
}
