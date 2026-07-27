import type { TenantRole } from "@/lib/auth/tenant";
import { canAccessBillingWorkspace } from "@/lib/billing-workspace/access";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import type { CashPoolDailySummaryRow, CashPoolRow } from "@/lib/cash-pool/repository";
import type { CashPoolDailyCloseStatus, CashReconciliationStatus } from "@/lib/cash-reconciliation/types";
import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { VesselProjectCostSummaryRow, VesselProjectRow } from "@/lib/vessel-projects/repository";

// pool_id -> business_date, used to render a business date on review-queue
// rows that only carry a pool_id (expense submissions, duplicate
// candidates) — those rows are not limited to today's pool.
export function buildCashPoolBusinessDateMap(pools: CashPoolRow[]): Map<string, string> {
  return new Map(pools.map((pool) => [pool.id, pool.business_date]));
}

export function getExpenseSubmissionsPendingReview(
  submissions: ExpenseSubmissionCurrentRow[],
): ExpenseSubmissionCurrentRow[] {
  return submissions.filter((submission) => submission.status === "submitted");
}

// A pool can accumulate more than one reconciliation cycle over its life
// (each reopen forces a new draft/cycle) — only the most recent cycle per
// pool is actionable by the owner; older cycles remain visible as
// read-only history (see reopen's "reconciliation lama tetap terlihat"
// requirement). Computed by created_at rather than trusting caller sort
// order.
export function getLatestReconciliationIdsByPool(
  reconciliations: CashPoolReconciliationCurrentRow[],
): Set<string> {
  const latestByPool = new Map<string, CashPoolReconciliationCurrentRow>();

  for (const row of reconciliations) {
    if (!row.pool_id || !row.reconciliation_id || !row.created_at) continue;
    const current = latestByPool.get(row.pool_id);
    if (!current || !current.created_at || row.created_at > current.created_at) {
      latestByPool.set(row.pool_id, row);
    }
  }

  return new Set(
    Array.from(latestByPool.values())
      .map((row) => row.reconciliation_id)
      .filter((id): id is string => id !== null),
  );
}

export interface ActiveProjectCostRow {
  projectId: string;
  label: string;
  totalCost: number;
}

// Only active Project Kapal are shown — matches the operations-daily
// picker's own active-only scope, and pairs each with its server-computed
// net cost from vessel_project_cost_summary (never summed in the browser).
export function buildActiveProjectCostRows(
  projects: VesselProjectRow[],
  vessels: VesselRow[],
  costSummaries: VesselProjectCostSummaryRow[],
): ActiveProjectCostRow[] {
  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));
  const costByProjectId = new Map(costSummaries.map((row) => [row.project_id, row.total_cost ?? 0]));

  return projects
    .filter((project) => project.lifecycle_status === "active")
    .map((project) => {
      const vesselName = vesselNameById.get(project.vessel_id) ?? "Kapal tidak dikenal";
      const label = project.project_code ? `${vesselName} — ${project.project_code}` : vesselName;
      return {
        projectId: project.id,
        label,
        totalCost: costByProjectId.get(project.id) ?? 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface UnbilledVesselIndicator {
  count: number;
  amountTotal: number;
}

// Gate 3B — Owner Dashboard "Kapal Belum Ditagihkan" attention indicator.
// isUnbilledAlert/unbilledAmountTotal are read verbatim from the Billing
// Workspace row (same unbilled_vessel_projects/Phase 2A semantics the
// Billing Workspace page itself uses — closed project, no active
// draft/issued invoice; an issued invoice always clears a project off this
// list, so this can never double as a collection/unpaid-invoice signal).
// Returns null when the role may not access the Billing Workspace, so the
// dashboard omits the indicator entirely rather than showing zeroed data —
// same gate listBillingWorkspaceForActiveTenant() itself enforces.
export function buildUnbilledVesselIndicator(
  roles: TenantRole[],
  billingRows: BillingWorkspaceRow[],
): UnbilledVesselIndicator | null {
  if (!canAccessBillingWorkspace(roles)) return null;

  const unbilled = billingRows.filter((row) => row.isUnbilledAlert);
  return {
    count: unbilled.length,
    amountTotal: unbilled.reduce((sum, row) => sum + row.unbilledAmountTotal, 0),
  };
}

export interface OwnerControlSummary {
  openingCash: number;
  totalCashIn: number;
  totalCashOutApproved: number;
  expectedClosingCash: number;
  dailyCloseStatus: CashPoolDailyCloseStatus | null;
  expensesPendingReviewCount: number;
  duplicateCandidatesPendingCount: number;
  eodReconciliationStatus: CashReconciliationStatus | null;
  activeProjectCount: number;
}

// Every number here is read straight off server-computed rows
// (cash_pool_daily_summary, cash_pool_reconciliation_current) — this
// function only reshapes them for the summary card, it never sums or
// derives a financial source of truth itself.
export function buildOwnerControlSummary(params: {
  summary: CashPoolDailySummaryRow | null;
  pool: CashPoolRow | null;
  expensesPendingReviewCount: number;
  duplicateCandidatesPendingCount: number;
  todayReconciliation: CashPoolReconciliationCurrentRow | null;
  activeProjectCount: number;
}): OwnerControlSummary {
  const {
    summary,
    pool,
    expensesPendingReviewCount,
    duplicateCandidatesPendingCount,
    todayReconciliation,
    activeProjectCount,
  } = params;

  return {
    openingCash: summary?.opening_cash ?? 0,
    totalCashIn: (summary?.cash_top_up ?? 0) + (summary?.other_cash_in ?? 0),
    totalCashOutApproved: summary?.total_cash_out ?? 0,
    expectedClosingCash: summary?.closing_cash ?? 0,
    dailyCloseStatus: pool?.daily_close_status ?? null,
    expensesPendingReviewCount,
    duplicateCandidatesPendingCount,
    eodReconciliationStatus: todayReconciliation?.status ?? null,
    activeProjectCount,
  };
}
