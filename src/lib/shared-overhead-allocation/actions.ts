"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  allocateSharedOverheadEntryForActiveTenant,
  reverseSharedOverheadAllocationForActiveTenant,
  type SharedOverheadAllocationActionResult,
} from "./service";

const OVERHEAD_POOL_PATH = "/operations/overhead";

function mapThrown(error: unknown): SharedOverheadAllocationActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  throw error;
}

export async function allocateSharedOverheadEntryAction(
  _prevState: SharedOverheadAllocationActionResult,
  formData: FormData,
): Promise<SharedOverheadAllocationActionResult> {
  let result: SharedOverheadAllocationActionResult;
  try {
    result = await allocateSharedOverheadEntryForActiveTenant({
      overheadEntryId: formData.get("overheadEntryId"),
      projectId: formData.get("projectId"),
      amount: formData.get("amount"),
      note: formData.get("note"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OVERHEAD_POOL_PATH);
    revalidatePath("/app/vessel-projects", "layout");
  }
  return result;
}

export async function reverseSharedOverheadAllocationAction(
  _prevState: SharedOverheadAllocationActionResult,
  formData: FormData,
): Promise<SharedOverheadAllocationActionResult> {
  let result: SharedOverheadAllocationActionResult;
  try {
    result = await reverseSharedOverheadAllocationForActiveTenant({
      allocationId: formData.get("allocationId"),
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(OVERHEAD_POOL_PATH);
    revalidatePath("/app/vessel-projects", "layout");
  }
  return result;
}
