import { buildCanonicalCommitPreview } from "./canonical-preview";
import { suggestMappingKindForLabel } from "./mapping-suggestions";
import type { CashImportBatchRow, CashImportCandidatePlanRow, CashImportRowRow } from "./repository";
import type { CashImportMappingKind } from "./types";

export interface CashImportLabelSummary {
  vesselLabel: string | null;
  rowCount: number;
  // null means "unset" (no row in the group has a mapping_kind yet) OR
  // "mixed" (rows in the group disagree — should not normally happen since
  // set_cash_import_label_mapping always fans out to the whole group, but a
  // partially-mapped batch mid-edit can transiently show this).
  mappingKind: CashImportMappingKind | null;
  mappedVesselProjectId: string | null;
  suggestedMappingKind: CashImportMappingKind;
  unmappedCount: number;
  // Gate 6I-A: this label's creation plan, if mappingKind is currently
  // 'new_project_candidate' and a plan has been saved for it.
  candidatePlan: CashImportCandidatePlanRow | null;
  // A label needs a human decision when it's still unmapped/unresolved, or
  // any row in the group still carries disposition null/manual_review.
  needsReview: boolean;
}

const NULL_LABEL_KEY = " NULL_VESSEL_LABEL ";

// Groups a batch's rows (excluding the opening balance row, which never
// carries a vessel_label or accepts a mapping) by vessel_label — the same
// grouping set_cash_import_label_mapping fans a single decision across.
export function summarizeCashImportLabels(
  rows: CashImportRowRow[],
  candidatePlans: CashImportCandidatePlanRow[] = [],
): CashImportLabelSummary[] {
  const groups = new Map<string, CashImportRowRow[]>();

  for (const row of rows) {
    if (row.provisional_classification === "opening_cash") {
      continue;
    }
    const key = row.vessel_label ?? NULL_LABEL_KEY;
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const planByLabel = new Map(candidatePlans.map((plan) => [plan.vessel_label, plan]));

  return [...groups.entries()]
    .map(([key, groupRows]) => {
      const vesselLabel = key === NULL_LABEL_KEY ? null : key;
      const mappingKinds = new Set(groupRows.map((row) => row.mapping_kind));
      const mappingKind = mappingKinds.size === 1 ? [...mappingKinds][0] : null;
      const projectIds = new Set(groupRows.map((row) => row.mapped_vessel_project_id));
      const mappedVesselProjectId = projectIds.size === 1 ? [...projectIds][0] : null;

      return {
        vesselLabel,
        rowCount: groupRows.length,
        mappingKind,
        mappedVesselProjectId,
        suggestedMappingKind: suggestMappingKindForLabel(vesselLabel),
        unmappedCount: groupRows.filter((row) => row.mapping_kind === null).length,
        candidatePlan: vesselLabel !== null ? (planByLabel.get(vesselLabel) ?? null) : null,
        needsReview:
          mappingKind === null ||
          mappingKind === "unresolved" ||
          groupRows.some((row) => row.disposition === null || row.disposition === "manual_review"),
      };
    })
    .sort((a, b) => (a.vesselLabel ?? "").localeCompare(b.vesselLabel ?? ""));
}

export interface CashImportBatchDecisionSummary {
  totalRows: number;
  autoDecidedRows: number;
  manualReviewRows: number;
  blockedRows: number;
  // Gate 6I-C: count of non-opening rows actually carrying disposition
  // 'include' — read directly off the row's own committed disposition, never
  // off disposition_reason text-matching. Unlike autoDecidedRows this is
  // reliable for ANY row regardless of how it was decided (bulk auto-apply
  // or one-at-a-time manual review), which is exactly what an applied
  // batch's summary needs to show as its "committed outcome".
  includedRows: number;
  existingProjectMappingCount: number;
  candidateProjectCount: number;
  projectCostTotal: number;
  overheadTotal: number;
  cashInRefundTotal: number;
  reconciliationVariance: number;
}

const AUTO_DISPOSITION_REASON_PREFIX = "Auto-disposition:";

// Pure rollup for the batch summary panel — reuses buildCanonicalCommitPreview's
// own bucket math (never recomputes the canonical totals independently) and
// adds the per-row decision-provenance counts the exception-only review UX
// needs. "Auto-decided" is read off disposition_reason's own prefix (set by
// auto_apply_cash_import_batch_dispositions) rather than re-deriving the
// classification rules a second time in TypeScript — that provenance signal
// is a best-effort hint useful DURING staging/review, and is not guaranteed
// to reflect how every row in an already-committed batch was actually
// decided (a row can be committed after a manual override that never
// touched disposition_reason). DecisionSummaryPanel therefore shows
// includedRows, not autoDecidedRows, once the batch is committed.
export function summarizeCashImportBatchDecisions(
  batch: CashImportBatchRow,
  rows: CashImportRowRow[],
  candidatePlans: CashImportCandidatePlanRow[],
  hasOpeningBalanceConflict = false,
): CashImportBatchDecisionSummary {
  const nonOpeningRows = rows.filter((row) => row.provisional_classification !== "opening_cash");
  const preview = buildCanonicalCommitPreview(batch, rows, hasOpeningBalanceConflict, candidatePlans);

  const autoDecidedRows = nonOpeningRows.filter(
    (row) => (row.disposition_reason ?? "").startsWith(AUTO_DISPOSITION_REASON_PREFIX) && row.disposition === "include",
  ).length;
  const manualReviewRows = nonOpeningRows.filter(
    (row) => row.disposition === "manual_review" || row.disposition === null,
  ).length;
  const includedRows = nonOpeningRows.filter((row) => row.disposition === "include").length;

  const existingProjectLabels = new Set(
    nonOpeningRows.filter((row) => row.mapping_kind === "existing_vessel_project").map((row) => row.vessel_label),
  );
  const candidateProjectLabels = new Set(
    nonOpeningRows.filter((row) => row.mapping_kind === "new_project_candidate").map((row) => row.vessel_label),
  );

  return {
    totalRows: rows.length,
    autoDecidedRows,
    manualReviewRows,
    blockedRows: preview.blockers.length,
    includedRows,
    existingProjectMappingCount: existingProjectLabels.size,
    candidateProjectCount: candidatePlans.length > 0 ? candidatePlans.length : candidateProjectLabels.size,
    projectCostTotal: preview.projectExpenseTotal,
    overheadTotal: preview.sharedOverheadTotal,
    cashInRefundTotal: preview.cashTopUpTotal + preview.projectRefundTotal,
    reconciliationVariance:
      batch.workbook_closing_balance === null ? 0 : batch.workbook_closing_balance - batch.calculated_closing_balance,
  };
}
