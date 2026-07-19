import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapCostLedgerError } from "./errors";
import {
  getVesselProjectCostSummary,
  listProjectCostLedgerEntries,
  recordProjectExpense,
  reverseProjectExpense,
  type ProjectCostLedgerEntryRow,
  type VesselProjectCostSummaryRow,
} from "./repository";
import { recordProjectExpenseInputSchema, reverseProjectExpenseInputSchema } from "./validation";

export interface CostLedgerActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface RecordProjectExpenseResult extends CostLedgerActionResult {
  entry?: ProjectCostLedgerEntryRow;
}

export async function listProjectCostLedgerEntriesForActiveTenant(
  projectId: string,
): Promise<ProjectCostLedgerEntryRow[]> {
  const context = await requireTenantContext();
  return listProjectCostLedgerEntries(context.tenantId, projectId);
}

// Server-computed summary — total_cost is derived entirely from trusted,
// tenant-scoped, non-reversed expense rows by the vessel_project_cost_summary
// view; nothing here accepts or forwards a client-supplied aggregate.
export async function getVesselProjectCostSummaryForActiveTenant(
  projectId: string,
): Promise<VesselProjectCostSummaryRow | null> {
  const context = await requireTenantContext();
  return getVesselProjectCostSummary(context.tenantId, projectId);
}

export async function recordProjectExpenseForActiveTenant(rawInput: unknown): Promise<RecordProjectExpenseResult> {
  const parsed = recordProjectExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await recordProjectExpense({
    poolId: input.poolId,
    projectId: input.projectId,
    categoryId: input.categoryId,
    amount: input.amount,
    description: input.description,
    vendorId: input.vendorId,
    referenceNumber: input.referenceNumber,
  });
  if (error || !data) {
    return { error: mapCostLedgerError(error) };
  }

  return { entry: data };
}

// Reason is the only caller-supplied field besides which entry to reverse —
// tenant_id, pool_id, project_id, category_id, vendor_id, and amount are all
// re-derived server-side by the reverse_project_expense RPC from the
// original entry row.
export async function reverseProjectExpenseForActiveTenant(rawInput: unknown): Promise<RecordProjectExpenseResult> {
  const parsed = reverseProjectExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await reverseProjectExpense(input.entryId, input.reason);
  if (error || !data) {
    return { error: mapCostLedgerError(error) };
  }

  return { entry: data };
}
