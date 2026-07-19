"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { idSchema, recordStatusSchema } from "../shared/validation";
import type { MasterDataActionResult } from "../clients/service";
import { createFacilityLocation, setFacilityLocationStatus, updateFacilityLocation } from "./service";
import { facilityLocationInputSchema, parseFacilityLocationFormData } from "./validation";

const FACILITY_LOCATIONS_PATH = "/app/master-data/facility-locations";

function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createFacilityLocationAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseFacilityLocationFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createFacilityLocation(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(FACILITY_LOCATIONS_PATH);
  redirect(FACILITY_LOCATIONS_PATH);
}

export async function updateFacilityLocationAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Lokasi fasilitas tidak valid." };
  }

  const parsed = facilityLocationInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateFacilityLocation(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(FACILITY_LOCATIONS_PATH);
  }
  return result;
}

export async function setFacilityLocationStatusAction(
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
    result = await setFacilityLocationStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(FACILITY_LOCATIONS_PATH);
  return result;
}
