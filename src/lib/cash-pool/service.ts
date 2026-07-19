import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapCashPoolError } from "./errors";
import {
  getDailyCashPool,
  getDailyCashPoolSummary,
  getOrCreateDailyCashPool,
  listCashPoolEntries,
  recordCashPoolEntry,
  reverseCashPoolEntry,
  type CashPoolDailySummaryRow,
  type CashPoolEntryRow,
  type CashPoolRow,
} from "./repository";
import {
  getOrCreateDailyCashPoolInputSchema,
  recordCashPoolEntryInputSchema,
  reverseCashPoolEntryInputSchema,
} from "./validation";

export interface CashPoolActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface EnsureDailyCashPoolResult extends CashPoolActionResult {
  pool?: CashPoolRow;
}

export interface RecordCashPoolEntryResult extends CashPoolActionResult {
  entry?: CashPoolEntryRow;
}

// Owner/admin only — matches the get_or_create_daily_cash_pool RPC's own
// role check. Idempotent: calling this twice for the same business date
// returns the same pool row both times.
export async function ensureDailyCashPoolForActiveTenant(rawInput: unknown): Promise<EnsureDailyCashPoolResult> {
  const parsed = getOrCreateDailyCashPoolInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await getOrCreateDailyCashPool(context.tenantId, parsed.data.businessDate);
  if (error || !data) {
    return { error: mapCashPoolError(error) };
  }

  return { pool: data };
}

export async function getDailyCashPoolForActiveTenant(businessDate: string): Promise<CashPoolRow | null> {
  const context = await requireTenantContext();
  return getDailyCashPool(context.tenantId, businessDate);
}

// Server-computed summary — closing_cash and every component sum are
// derived entirely from trusted, tenant-scoped rows by the
// cash_pool_daily_summary view; nothing here accepts or forwards a
// client-supplied aggregate.
export async function getDailyCashPoolSummaryForActiveTenant(
  businessDate: string,
): Promise<CashPoolDailySummaryRow | null> {
  const context = await requireTenantContext();
  return getDailyCashPoolSummary(context.tenantId, businessDate);
}

export async function listCashPoolEntriesForActiveTenant(poolId: string): Promise<CashPoolEntryRow[]> {
  const context = await requireTenantContext();
  return listCashPoolEntries(context.tenantId, poolId);
}

export async function recordCashPoolEntryForActiveTenant(rawInput: unknown): Promise<RecordCashPoolEntryResult> {
  const parsed = recordCashPoolEntryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await recordCashPoolEntry(input.poolId, input.entryType, input.amount, input.description);
  if (error || !data) {
    return { error: mapCashPoolError(error) };
  }

  return { entry: data };
}

// Reason is the only caller-supplied field besides which entry to reverse —
// tenant_id, entry_type, and amount are all re-derived server-side by the
// reverse_cash_pool_entry RPC from the original entry row.
export async function reverseCashPoolEntryForActiveTenant(rawInput: unknown): Promise<RecordCashPoolEntryResult> {
  const parsed = reverseCashPoolEntryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await reverseCashPoolEntry(input.entryId, input.reason);
  if (error || !data) {
    return { error: mapCashPoolError(error) };
  }

  return { entry: data };
}
