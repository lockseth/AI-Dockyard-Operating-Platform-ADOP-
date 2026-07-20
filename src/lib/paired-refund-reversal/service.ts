import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapPairedRefundReversalError } from "./errors";
import { reversePairedProjectRefund, type ReversePairedProjectRefundResult } from "./repository";
import { reversePairedProjectRefundInputSchema } from "./validation";

export interface ReversePairedProjectRefundActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  result?: ReversePairedProjectRefundResult;
}

// Owner-only — the strictest of the two single-sided reversal RPCs this
// replaces the capability of (see 20260720150000's own comment), enforced
// again independently inside the SECURITY DEFINER RPC itself.
export async function reversePairedProjectRefundForActiveTenant(
  rawInput: unknown,
): Promise<ReversePairedProjectRefundActionResult> {
  const parsed = reversePairedProjectRefundInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await reversePairedProjectRefund({
    cashEntryId: input.cashEntryId,
    costEntryId: input.costEntryId,
    reason: input.reason,
  });

  if (error || !data?.[0]) {
    return { error: mapPairedRefundReversalError(error) };
  }

  return { result: data[0] };
}
