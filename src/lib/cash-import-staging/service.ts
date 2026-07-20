import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { parseCashReportWorkbook } from "@/lib/cash-import/parser";
import type { CashImportFileError } from "@/lib/cash-import/types";
import { mapCashImportStagingError } from "./errors";
import {
  approveAndCommitCashImportBatch,
  createCashImportBatch,
  getCashImportBatch,
  listCashImportBatchesForTenant,
  listCashImportEventsForBatch,
  listCashImportRowsForBatch,
  markCashImportBatchReadyForReview,
  rejectCashImportBatch,
  setCashImportLabelMapping,
  setCashImportRowDisposition,
  type CashImportBatchRow,
  type CashImportEventRow,
  type CashImportRowRow,
} from "./repository";
import { toBatchRpcRow } from "./types";
import {
  approveAndCommitCashImportBatchInputSchema,
  getCashImportBatchDetailInputSchema,
  markCashImportBatchReadyForReviewInputSchema,
  rejectCashImportBatchInputSchema,
  setCashImportLabelMappingInputSchema,
  setCashImportRowDispositionInputSchema,
} from "./validation";

export interface CashImportStagingActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface UploadCashImportResult extends CashImportStagingActionResult {
  fileError?: CashImportFileError;
  batchId?: string;
  isNew?: boolean;
}

export interface CashImportBatchDetail {
  batch: CashImportBatchRow;
  rows: CashImportRowRow[];
  events: CashImportEventRow[];
}

// RLS (owner/admin only) is the final enforcement layer for reads — same
// posture as listPendingExpenseDuplicateCandidatesForActiveTenant.
export async function listCashImportBatchesForActiveTenant(): Promise<CashImportBatchRow[]> {
  const context = await requireTenantContext();
  return listCashImportBatchesForTenant(context.tenantId);
}

export async function getCashImportBatchDetailForActiveTenant(rawInput: unknown): Promise<CashImportBatchDetail | null> {
  const parsed = getCashImportBatchDetailInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return null;
  }

  const context = await requireTenantContext();
  const batch = await getCashImportBatch(context.tenantId, parsed.data.batchId);
  if (!batch) {
    return null;
  }

  const [rows, events] = await Promise.all([
    listCashImportRowsForBatch(context.tenantId, batch.id),
    listCashImportEventsForBatch(context.tenantId, batch.id),
  ]);

  return { batch, rows, events };
}

// The buffer is read once here, parsed in memory, and discarded — never
// written to disk or storage, matching Gate 1J-A's boundary. Only the
// parser's own validated analysis (never a client-editable form field)
// reaches the RPC.
export async function uploadCashReportForActiveTenant(file: File): Promise<UploadCashImportResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["admin"]);

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseResult = parseCashReportWorkbook(buffer, file.name);
  if (!parseResult.ok) {
    return { fileError: parseResult.fileError };
  }

  const analysis = parseResult.analysis;
  const businessDate = analysis.rows[0]?.business_date;
  if (!businessDate) {
    return { error: "Tanggal laporan tidak ditemukan pada file." };
  }

  const { data, error } = await createCashImportBatch({
    tenantId: context.tenantId,
    sourceFilename: analysis.identity.fileName,
    sourceSha256: analysis.identity.fileSha256,
    sourceSheetName: analysis.identity.sheetUsed,
    businessDate,
    openingBalance: analysis.summary.openingBalance ?? 0,
    workbookClosingBalance: analysis.summary.workbookReportedClosingBalance,
    rows: analysis.rows.map(toBatchRpcRow),
  });

  if (error || !data?.batch) {
    return { error: mapCashImportStagingError(error) };
  }

  return { batchId: data.batch.id, isNew: data.is_new ?? false };
}

export async function setCashImportLabelMappingForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = setCashImportLabelMappingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["admin"]);

  const { error } = await setCashImportLabelMapping({
    batchId: input.batchId,
    vesselLabel: input.vesselLabel,
    mappingKind: input.mappingKind,
    mappedVesselProjectId: input.mappingKind === "existing_vessel_project" ? input.mappedVesselProjectId : null,
  });
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}

export async function setCashImportRowDispositionForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = setCashImportRowDispositionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["admin"]);

  const { error } = await setCashImportRowDisposition({
    rowId: input.rowId,
    disposition: input.disposition,
    reason: input.reason ?? null,
  });
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}

export async function markCashImportBatchReadyForReviewForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = markCashImportBatchReadyForReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["admin"]);

  const { error } = await markCashImportBatchReadyForReview(parsed.data.batchId);
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}

// Owner-only. The RPC performs the atomic canonical commit in a single
// transaction (opening balance, cash top-up, project expense, shared
// overhead, paired project refund) — nothing here computes or forwards a
// canonical total; the committed batch row (with its server-computed
// canonical_* columns) is the only source of truth for what actually posted.
export async function approveAndCommitCashImportBatchForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = approveAndCommitCashImportBatchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { error } = await approveAndCommitCashImportBatch(parsed.data.batchId);
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}

// Owner-only. Returns the batch to mapping_required — no canonical mutation
// of any kind (proven at the RPC/pgTAP layer).
export async function rejectCashImportBatchForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = rejectCashImportBatchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { error } = await rejectCashImportBatch(parsed.data.batchId, parsed.data.reason);
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}
