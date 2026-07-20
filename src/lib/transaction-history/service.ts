import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapTrustedTransactionHistoryError } from "./errors";
import {
  getTrustedTransactionDetail,
  listTrustedTransactions,
  summarizeTrustedTransactions,
  type TrustedTransactionSummary,
} from "./repository";
import {
  decodeTrustedTransactionCursor,
  encodeTrustedTransactionCursor,
  type TrustedTransactionRow,
} from "./types";
import {
  getTrustedTransactionDetailInputSchema,
  listTrustedTransactionsInputSchema,
  summarizeTrustedTransactionsInputSchema,
} from "./validation";

export interface TrustedTransactionListPage {
  transactions: TrustedTransactionRow[];
  nextCursor: string | null;
}

// Owner/Admin-only per task LOCK — requireTenantRole is an early UX
// rejection only; the SECURITY DEFINER RPCs re-verify independently, so a
// bypass here cannot leak data (see access.ts).
export async function listTrustedTransactionsForActiveTenant(rawInput: unknown): Promise<TrustedTransactionListPage> {
  const parsed = listTrustedTransactionsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { transactions: [], nextCursor: null };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const cursor = input.cursor ? decodeTrustedTransactionCursor(input.cursor) : null;

  const { data, error } = await tryListTrustedTransactions({
    tenantId: context.tenantId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    projectId: input.projectId,
    transactionType: input.transactionType,
    transactionDirection: input.transactionDirection,
    source: input.source,
    status: input.status,
    importBatchId: input.importBatchId,
    search: input.search,
    cursorBusinessDate: cursor?.businessDate,
    cursorCreatedAt: cursor?.createdAt,
    cursorLogicalId: cursor?.logicalTransactionId,
    limit: input.limit,
  });

  if (error || !data) {
    return { transactions: [], nextCursor: null };
  }

  const last = data.length === input.limit ? data[data.length - 1] : null;
  const nextCursor =
    last && last.business_date && last.created_at && last.logical_transaction_id
      ? encodeTrustedTransactionCursor({
          businessDate: last.business_date,
          createdAt: last.created_at,
          logicalTransactionId: last.logical_transaction_id,
        })
      : null;

  return { transactions: data, nextCursor };
}

async function tryListTrustedTransactions(
  params: Parameters<typeof listTrustedTransactions>[0],
): Promise<{ data: TrustedTransactionRow[] | null; error?: string }> {
  try {
    return { data: await listTrustedTransactions(params) };
  } catch (error) {
    return { data: null, error: mapTrustedTransactionHistoryError(error as never) };
  }
}

export async function summarizeTrustedTransactionsForActiveTenant(
  rawInput: unknown,
): Promise<TrustedTransactionSummary | null> {
  const parsed = summarizeTrustedTransactionsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return null;
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  try {
    return await summarizeTrustedTransactions({
      tenantId: context.tenantId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      projectId: input.projectId,
      transactionType: input.transactionType,
      transactionDirection: input.transactionDirection,
      source: input.source,
      status: input.status,
      importBatchId: input.importBatchId,
      search: input.search,
    });
  } catch {
    return null;
  }
}

export async function getTrustedTransactionDetailForActiveTenant(
  rawInput: unknown,
): Promise<TrustedTransactionRow | null> {
  const parsed = getTrustedTransactionDetailInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return null;
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  try {
    return await getTrustedTransactionDetail(context.tenantId, parsed.data.logicalTransactionId);
  } catch {
    return null;
  }
}
