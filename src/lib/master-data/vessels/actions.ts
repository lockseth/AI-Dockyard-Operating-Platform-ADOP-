"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { idSchema, recordStatusSchema } from "../shared/validation";
import type { MasterDataActionResult } from "../clients/service";
import { createVessel, setVesselStatus, updateVessel } from "./service";
import { parseCreateVesselFormData, parseUpdateVesselFormData } from "./validation";

const VESSELS_PATH = "/app/master-data/vessels";

function clientPath(clientId: string): string {
  return `/app/master-data/clients/${clientId}`;
}

function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createVesselAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseCreateVesselFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createVessel(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(VESSELS_PATH);
  revalidatePath(clientPath(parsed.data.clientId));
  redirect(clientPath(parsed.data.clientId));
}

export async function updateVesselAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Kapal tidak valid." };
  }

  const parsed = parseUpdateVesselFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateVessel(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(VESSELS_PATH);
    const clientIdRaw = formData.get("clientId");
    if (typeof clientIdRaw === "string" && clientIdRaw.length > 0) {
      revalidatePath(clientPath(clientIdRaw));
    }
  }

  return result;
}

export async function setVesselStatusAction(
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
    result = await setVesselStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(VESSELS_PATH);
  const clientIdRaw = formData.get("clientId");
  if (typeof clientIdRaw === "string" && clientIdRaw.length > 0) {
    revalidatePath(clientPath(clientIdRaw));
  }

  return result;
}
