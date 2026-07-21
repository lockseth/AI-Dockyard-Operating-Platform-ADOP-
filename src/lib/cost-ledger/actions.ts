"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { reverseProjectExpenseForActiveTenant, type RecordProjectExpenseResult } from "./service";

// Mirrors src/lib/operations-daily/actions.ts's mapThrown convention —
// tenant_id/actor/project_id/category_id/vendor_id/amount are all re-derived
// server-side inside service.ts and the reverse_project_expense RPC, never
// read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function reverseProjectExpenseAction(
  _prevState: RecordProjectExpenseResult,
  formData: FormData,
): Promise<RecordProjectExpenseResult> {
  let result: RecordProjectExpenseResult;
  try {
    result = await reverseProjectExpenseForActiveTenant({
      entryId: formData.get("entryId"),
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
