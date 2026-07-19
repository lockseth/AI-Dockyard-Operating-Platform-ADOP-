"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { idSchema, recordStatusSchema } from "../shared/validation";
import type { MasterDataActionResult } from "../clients/service";
import { createVendor, setVendorStatus, updateVendor } from "./service";
import { parseVendorFormData, vendorInputSchema } from "./validation";

const VENDORS_PATH = "/app/master-data/vendors";

function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createVendorAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseVendorFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createVendor(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(VENDORS_PATH);
  redirect(VENDORS_PATH);
}

export async function updateVendorAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Vendor tidak valid." };
  }

  const parsed = vendorInputSchema.safeParse({
    vendorCode: formData.get("vendorCode"),
    displayName: formData.get("displayName"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateVendor(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(VENDORS_PATH);
  }
  return result;
}

export async function setVendorStatusAction(
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
    result = await setVendorStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(VENDORS_PATH);
  return result;
}
