"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { reverseCashPoolEntryForActiveTenant, type RecordCashPoolEntryResult } from "./service";

// Mirrors src/lib/operations-daily/actions.ts's mapThrown convention —
// tenant_id/actor/entry_type/amount are all re-derived server-side inside
// service.ts and the reverse_cash_pool_entry RPC, never read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function reverseCashPoolEntryAction(
  _prevState: RecordCashPoolEntryResult,
  formData: FormData,
): Promise<RecordCashPoolEntryResult> {
  let result: RecordCashPoolEntryResult;
  try {
    result = await reverseCashPoolEntryForActiveTenant({
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
