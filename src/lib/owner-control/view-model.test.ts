import { describe, expect, it } from "vitest";
import {
  buildActiveProjectCostRows,
  buildCashPoolBusinessDateMap,
  buildOwnerControlSummary,
  buildUnbilledVesselIndicator,
  getExpenseSubmissionsPendingReview,
  getLatestReconciliationIdsByPool,
} from "./view-model";
import type { BillingWorkspaceRow } from "@/lib/billing-workspace/types";
import type { CashPoolRow } from "@/lib/cash-pool/repository";
import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { VesselProjectCostSummaryRow } from "@/lib/vessel-projects/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";

function pool(overrides: Partial<CashPoolRow>): CashPoolRow {
  return {
    id: "pool-1",
    tenant_id: "tenant-1",
    business_date: "2026-07-20",
    daily_close_status: "open",
    financial_version: 1,
    created_at: "2026-07-20T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-20T00:00:00Z",
    ...overrides,
  } as CashPoolRow;
}

function submission(overrides: Partial<ExpenseSubmissionCurrentRow>): ExpenseSubmissionCurrentRow {
  return {
    submission_id: "sub-1",
    tenant_id: "tenant-1",
    pool_id: "pool-1",
    project_id: "project-1",
    category_id: "category-1",
    vendor_id: null,
    amount: 100000,
    description: "Solar",
    reference_number: null,
    status: "submitted",
    revision_id: "rev-1",
    revision_number: 1,
    revision_created_at: "2026-07-20T00:00:00Z",
    revision_created_by: null,
    ledger_entry_id: null,
    created_at: "2026-07-20T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-20T00:00:00Z",
    decided_at: null,
    decided_by: null,
    ...overrides,
  } as ExpenseSubmissionCurrentRow;
}

function reconciliation(
  overrides: Partial<CashPoolReconciliationCurrentRow>,
): CashPoolReconciliationCurrentRow {
  return {
    reconciliation_id: "recon-1",
    tenant_id: "tenant-1",
    pool_id: "pool-1",
    business_date: "2026-07-20",
    pool_daily_close_status: "open",
    pool_financial_version: 1,
    status: "submitted",
    current_revision_id: "recon-rev-1",
    revision_number: 1,
    actual_counted_cash: 500000,
    explanation: null,
    created_by: null,
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    submitted_by: null,
    submitted_opening_cash: 400000,
    submitted_cash_top_up: 100000,
    submitted_other_cash_in: 0,
    submitted_total_cash_out: 0,
    submitted_expected_closing_cash: 500000,
    submitted_variance: 0,
    submitted_financial_version: 1,
    submitted_at: "2026-07-20T01:00:00Z",
    is_stale: false,
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    superseded_at: null,
    superseded_by_reopen_event_id: null,
    ...overrides,
  } as CashPoolReconciliationCurrentRow;
}

function project(overrides: Partial<VesselProjectRow>): VesselProjectRow {
  return {
    id: "project-1",
    tenant_id: "tenant-1",
    vessel_id: "vessel-1",
    client_id: "client-1",
    service_type_id: "service-1",
    facility_location_id: "facility-1",
    project_code: null,
    lifecycle_status: "active",
    start_date: "2026-07-01",
    ready_to_close_at: null,
    closed_at: null,
    closed_by: null,
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as VesselProjectRow;
}

function vessel(overrides: Partial<VesselRow>): VesselRow {
  return {
    id: "vessel-1",
    tenant_id: "tenant-1",
    client_id: "client-1",
    vessel_name: "MV Contoh",
    vessel_code: null,
    vessel_type: null,
    registration_number: null,
    status: "active",
    created_at: "2026-07-01T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as VesselRow;
}

describe("buildCashPoolBusinessDateMap", () => {
  it("maps pool id to business date", () => {
    const map = buildCashPoolBusinessDateMap([
      pool({ id: "pool-a", business_date: "2026-07-19" }),
      pool({ id: "pool-b", business_date: "2026-07-20" }),
    ]);
    expect(map.get("pool-a")).toBe("2026-07-19");
    expect(map.get("pool-b")).toBe("2026-07-20");
  });
});

describe("getExpenseSubmissionsPendingReview", () => {
  it("keeps only submitted submissions", () => {
    const result = getExpenseSubmissionsPendingReview([
      submission({ submission_id: "sub-submitted", status: "submitted" }),
      submission({ submission_id: "sub-draft", status: "draft" }),
      submission({ submission_id: "sub-approved", status: "approved" }),
    ]);
    expect(result.map((s) => s.submission_id)).toEqual(["sub-submitted"]);
  });
});

describe("getLatestReconciliationIdsByPool", () => {
  it("keeps only the most recent reconciliation per pool", () => {
    const rows = [
      reconciliation({ reconciliation_id: "old", pool_id: "pool-1", created_at: "2026-07-19T00:00:00Z" }),
      reconciliation({ reconciliation_id: "new", pool_id: "pool-1", created_at: "2026-07-20T00:00:00Z" }),
      reconciliation({ reconciliation_id: "other-pool", pool_id: "pool-2", created_at: "2026-07-18T00:00:00Z" }),
    ];
    const latest = getLatestReconciliationIdsByPool(rows);
    expect(latest).toEqual(new Set(["new", "other-pool"]));
  });

  it("is independent of input order", () => {
    const rows = [
      reconciliation({ reconciliation_id: "new", pool_id: "pool-1", created_at: "2026-07-20T00:00:00Z" }),
      reconciliation({ reconciliation_id: "old", pool_id: "pool-1", created_at: "2026-07-19T00:00:00Z" }),
    ];
    expect(getLatestReconciliationIdsByPool(rows)).toEqual(new Set(["new"]));
  });

  it("returns an empty set for no reconciliations", () => {
    expect(getLatestReconciliationIdsByPool([])).toEqual(new Set());
  });
});

describe("buildActiveProjectCostRows", () => {
  function costSummary(overrides: Partial<VesselProjectCostSummaryRow>): VesselProjectCostSummaryRow {
    return { project_id: "project-1", tenant_id: "tenant-1", total_cost: 0, ...overrides } as VesselProjectCostSummaryRow;
  }

  it("excludes ready_to_close and closed projects", () => {
    const rows = buildActiveProjectCostRows(
      [
        project({ id: "p-active", lifecycle_status: "active" }),
        project({ id: "p-closed", lifecycle_status: "closed" }),
      ],
      [vessel({})],
      [],
    );
    expect(rows.map((r) => r.projectId)).toEqual(["p-active"]);
  });

  it("pairs each active project with its server-computed total cost", () => {
    const rows = buildActiveProjectCostRows(
      [project({ id: "p-1", vessel_id: "v-1", project_code: "DOCK-01" })],
      [vessel({ id: "v-1", vessel_name: "MV Sejahtera" })],
      [costSummary({ project_id: "p-1", total_cost: 250000 })],
    );
    expect(rows).toEqual([{ projectId: "p-1", label: "MV Sejahtera — DOCK-01", totalCost: 250000 }]);
  });

  it("defaults total cost to zero when no cost row exists", () => {
    const rows = buildActiveProjectCostRows([project({ id: "p-1" })], [vessel({})], []);
    expect(rows[0].totalCost).toBe(0);
  });
});

function billingRow(overrides: Partial<BillingWorkspaceRow> = {}): BillingWorkspaceRow {
  return {
    projectId: "project-1",
    vesselName: "MV Contoh",
    projectCode: "DOCK-01",
    clientId: "client-1",
    clientName: "PT Client",
    lifecycleStatus: "closed",
    closedAt: "2026-07-01T00:00:00Z",
    status: "NO_INVOICE",
    activeInvoice: null,
    isUnbilledAlert: true,
    unbilledTransactionCount: 3,
    unbilledAmountTotal: 1_500_000,
    lastVoidedInvoiceId: null,
    lastVoidReason: null,
    ...overrides,
  };
}

describe("buildUnbilledVesselIndicator — Gate 3B unbilled vessel attention indicator", () => {
  it("counts and sums only rows flagged isUnbilledAlert by the canonical billing workspace read", () => {
    const result = buildUnbilledVesselIndicator(["owner"], [
      billingRow({ projectId: "p-1", isUnbilledAlert: true, unbilledAmountTotal: 1_000_000 }),
      billingRow({ projectId: "p-2", isUnbilledAlert: true, unbilledAmountTotal: 2_500_000 }),
    ]);
    expect(result).toEqual({ count: 2, amountTotal: 3_500_000 });
  });

  it("never treats a closed project with an issued invoice as unbilled", () => {
    // isUnbilledAlert is read verbatim from the canonical row — a project
    // with an active issued invoice always resolves isUnbilledAlert: false
    // upstream, so this must not recompute status from activeInvoice itself.
    const result = buildUnbilledVesselIndicator(["owner"], [
      billingRow({
        projectId: "p-issued",
        isUnbilledAlert: false,
        status: "READY_TO_SEND",
        activeInvoice: { id: "inv-1" } as never,
        unbilledAmountTotal: 0,
      }),
    ]);
    expect(result).toEqual({ count: 0, amountTotal: 0 });
  });

  it("returns a zero-value (not null) indicator when there are simply no unbilled rows", () => {
    const result = buildUnbilledVesselIndicator(["owner"], [billingRow({ isUnbilledAlert: false })]);
    expect(result).toEqual({ count: 0, amountTotal: 0 });
  });

  it("is null-safe against an empty billing workspace", () => {
    expect(buildUnbilledVesselIndicator(["owner"], [])).toEqual({ count: 0, amountTotal: 0 });
  });

  it("allows admin, same as owner", () => {
    const result = buildUnbilledVesselIndicator(["admin"], [billingRow({ isUnbilledAlert: true, unbilledAmountTotal: 750_000 })]);
    expect(result).toEqual({ count: 1, amountTotal: 750_000 });
  });

  it("returns null for reviewer — a role that cannot access the Billing Workspace", () => {
    expect(buildUnbilledVesselIndicator(["reviewer"], [billingRow({ isUnbilledAlert: true })])).toBeNull();
  });

  it("returns null for viewer", () => {
    expect(buildUnbilledVesselIndicator(["viewer"], [billingRow({ isUnbilledAlert: true })])).toBeNull();
  });

  it("returns null for a user with no roles at all", () => {
    expect(buildUnbilledVesselIndicator([], [billingRow({ isUnbilledAlert: true })])).toBeNull();
  });

  it("allows a user with multiple roles including owner, even if another role is unauthorized", () => {
    const result = buildUnbilledVesselIndicator(["viewer", "owner"], [billingRow({ isUnbilledAlert: true, unbilledAmountTotal: 400_000 })]);
    expect(result).toEqual({ count: 1, amountTotal: 400_000 });
  });
});

describe("buildOwnerControlSummary", () => {
  it("derives every field from server-computed rows without summing in the browser", () => {
    const result = buildOwnerControlSummary({
      summary: {
        pool_id: "pool-1",
        tenant_id: "tenant-1",
        business_date: "2026-07-20",
        created_at: "2026-07-20T00:00:00Z",
        opening_cash: 400000,
        cash_top_up: 100000,
        other_cash_in: 20000,
        total_cash_out: 50000,
        closing_cash: 470000,
      } as never,
      pool: pool({ daily_close_status: "pending_close" }),
      expensesPendingReviewCount: 3,
      duplicateCandidatesPendingCount: 1,
      todayReconciliation: reconciliation({ status: "submitted" }),
      activeProjectCount: 2,
    });

    expect(result).toEqual({
      openingCash: 400000,
      totalCashIn: 120000,
      totalCashOutApproved: 50000,
      expectedClosingCash: 470000,
      dailyCloseStatus: "pending_close",
      expensesPendingReviewCount: 3,
      duplicateCandidatesPendingCount: 1,
      eodReconciliationStatus: "submitted",
      activeProjectCount: 2,
    });
  });

  it("defaults to zero/null when no pool or summary exists yet", () => {
    const result = buildOwnerControlSummary({
      summary: null,
      pool: null,
      expensesPendingReviewCount: 0,
      duplicateCandidatesPendingCount: 0,
      todayReconciliation: null,
      activeProjectCount: 0,
    });

    expect(result.openingCash).toBe(0);
    expect(result.totalCashIn).toBe(0);
    expect(result.dailyCloseStatus).toBeNull();
    expect(result.eodReconciliationStatus).toBeNull();
  });
});
