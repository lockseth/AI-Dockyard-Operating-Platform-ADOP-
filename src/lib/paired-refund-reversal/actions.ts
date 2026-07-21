"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  reversePairedProjectRefundForActiveTenant,
  type ReversePairedProjectRefundActionResult,
} from "./service";

// Mirrors src/lib/operations-daily/actions.ts's mapThrown convention —
// tenant_id/actor are re-derived server-side inside service.ts and the
// reverse_paired_project_refund RPC, never read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function reversePairedProjectRefundAction(
  _prevState: ReversePairedProjectRefundActionResult,
  formData: FormData,
): Promise<ReversePairedProjectRefundActionResult> {
  let result: ReversePairedProjectRefundActionResult;
  try {
    result = await reversePairedProjectRefundForActiveTenant({
      cashEntryId: formData.get("cashEntryId"),
      costEntryId: formData.get("costEntryId"),
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath("/operations/history");
  }
  return result;
}
