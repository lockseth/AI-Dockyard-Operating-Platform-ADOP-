import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { parseCashReportWorkbook } from "@/lib/cash-import/parser";
import type { CashImportFileError } from "@/lib/cash-import/types";
import { listClientsForActiveTenant } from "@/lib/master-data/clients/service";
import type { ClientRow } from "@/lib/master-data/clients/repository";
import { listServiceTypesForActiveTenant } from "@/lib/master-data/service-types/service";
import type { ServiceTypeRow } from "@/lib/master-data/service-types/repository";
import { listFacilityLocationsForActiveTenant } from "@/lib/master-data/facility-locations/service";
import type { FacilityLocationRow } from "@/lib/master-data/facility-locations/repository";
import { mapCashImportStagingError } from "./errors";
import {
  approveAndCommitCashImportBatch,
  autoApplyCashImportBatchDispositions,
  createCashImportBatch,
  getCashImportBatch,
  hasExistingFinancialEntriesForBusinessDate,
  listCashImportBatchesForTenant,
  listCashImportCandidatePlansForBatch,
  listCashImportEventsForBatch,
  listCashImportRowsForBatch,
  markCashImportBatchReadyForReview,
  rejectCashImportBatch,
  rollbackCashImportBatch,
  setCashImportLabelMapping,
  setCashImportRowDisposition,
  type CashImportAutoDispositionResult,
  type CashImportBatchRow,
  type CashImportCandidatePlanRow,
  type CashImportEventRow,
  type CashImportRowRow,
} from "./repository";
import { toBatchRpcRow } from "./types";
import {
  approveAndCommitCashImportBatchInputSchema,
  autoApplyCashImportBatchDispositionsInputSchema,
  getCashImportBatchDetailInputSchema,
  markCashImportBatchReadyForReviewInputSchema,
  rejectCashImportBatchInputSchema,
  rollbackCashImportBatchInputSchema,
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
  // Read-only mirror of the commit RPC's own OPENING_BALANCE_CONFLICT check
  // — true when a cash pool for this batch's business_date already has ANY
  // cash_pool_entries/project_cost_ledger_entries row(s), matching the
  // exact commit-time guard. Shown as a BLOCKED signal before the owner
  // ever attempts approval; the RPC's own check remains the real
  // enforcement (this can go stale between page load and commit — a
  // concurrent commit still fails safely at that point).
  hasOpeningBalanceConflict: boolean;
  // Gate 6I-A: one row per vessel_label currently mapped 'new_project_candidate'
  // — a pure creation plan, never yet a real vessel/project.
  candidatePlans: CashImportCandidatePlanRow[];
  // Master lists for the candidate-plan form (Client/Service Type/Facility
  // selects) — same lists the master-data direct-entry pages already expose.
  clients: ClientRow[];
  serviceTypes: ServiceTypeRow[];
  facilityLocations: FacilityLocationRow[];
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

  const [rows, events, hasOpeningBalanceConflict, candidatePlans, clients, serviceTypes, facilityLocations] =
    await Promise.all([
      listCashImportRowsForBatch(context.tenantId, batch.id),
      listCashImportEventsForBatch(context.tenantId, batch.id),
      hasExistingFinancialEntriesForBusinessDate(context.tenantId, batch.business_date),
      listCashImportCandidatePlansForBatch(context.tenantId, batch.id),
      listClientsForActiveTenant(),
      listServiceTypesForActiveTenant(),
      listFacilityLocationsForActiveTenant(),
    ]);

  return { batch, rows, events, hasOpeningBalanceConflict, candidatePlans, clients, serviceTypes, facilityLocations };
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

  const isCandidate = input.mappingKind === "new_project_candidate";
  const { error } = await setCashImportLabelMapping({
    batchId: input.batchId,
    vesselLabel: input.vesselLabel,
    mappingKind: input.mappingKind,
    mappedVesselProjectId: input.mappingKind === "existing_vessel_project" ? input.mappedVesselProjectId : null,
    candidateVesselName: isCandidate ? input.candidateVesselName : null,
    candidateClientId: isCandidate ? input.candidateClientId : null,
    candidateServiceTypeId: isCandidate ? input.candidateServiceTypeId : null,
    candidateFacilityLocationId: isCandidate ? input.candidateFacilityLocationId : null,
    candidateStartDate: isCandidate ? input.candidateStartDate : null,
    candidatePriority: isCandidate ? input.candidatePriority : undefined,
  });
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}

// Admin-only, same posture as the other mapping/disposition edits. Only
// ever fills in rows that currently have disposition IS NULL — see the RPC
// header in the Gate 6I-A migration for the exact eligibility rules.
export async function autoApplyCashImportBatchDispositionsForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult & { result?: CashImportAutoDispositionResult }> {
  const parsed = autoApplyCashImportBatchDispositionsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["admin"]);

  const { data, error } = await autoApplyCashImportBatchDispositions({
    batchId: input.batchId,
    vesselLabel: input.vesselLabel ?? null,
    scopeToLabel: input.scopeToLabel ?? false,
  });
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return { result: data ?? undefined };
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

// Owner-only. The RPC performs the atomic append-only rollback in a single
// transaction (opening balance, cash top-up, project expense, shared
// overhead, paired project refund reversal) — nothing here computes or
// forwards a reversed total; the rolled-back batch row (with its server-
// computed rollback_* snapshot columns) is the only source of truth for
// what actually reversed.
export async function rollbackCashImportBatchForActiveTenant(
  rawInput: unknown,
): Promise<CashImportStagingActionResult> {
  const parsed = rollbackCashImportBatchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { error } = await rollbackCashImportBatch(parsed.data.batchId, parsed.data.reason);
  if (error) {
    return { error: mapCashImportStagingError(error) };
  }

  return {};
}
