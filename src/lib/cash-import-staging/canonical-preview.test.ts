import { describe, expect, it } from "vitest";
import { buildCanonicalCommitPreview } from "./canonical-preview";
import type { CashImportBatchRow, CashImportRowRow } from "./repository";

function batch(overrides: Partial<CashImportBatchRow>): CashImportBatchRow {
  return {
    id: "batch-id",
    tenant_id: "tenant-id",
    source_filename: "laporan.xlsx",
    source_sha256: "sha",
    source_sheet_name: "Sheet1",
    business_date: "2036-07-17",
    opening_balance: 7_870_794,
    total_debit: 0,
    total_credit: 0,
    calculated_closing_balance: 0,
    workbook_closing_balance: 0,
    transaction_count: 0,
    warning_count: 0,
    error_count: 0,
    status: "ready_for_review",
    created_by: null,
    created_at: "2036-07-17T00:00:00Z",
    updated_at: "2036-07-17T00:00:00Z",
    committed_at: null,
    committed_by: null,
    canonical_opening_cash: null,
    canonical_cash_top_up_total: null,
    canonical_project_refund_total: null,
    canonical_project_expense_total: null,
    canonical_shared_overhead_total: null,
    canonical_closing_cash: null,
    ...overrides,
  } as CashImportBatchRow;
}

function row(overrides: Partial<CashImportRowRow>): CashImportRowRow {
  return {
    id: "row-id",
    tenant_id: "tenant-id",
    batch_id: "batch-id",
    source_row_number: 1,
    source_fingerprint: "fp",
    description: null,
    vessel_label: null,
    debit: null,
    credit: null,
    workbook_balance: null,
    calculated_balance: null,
    provisional_classification: "manual_mapping_required",
    status: "valid",
    mapping_kind: null,
    mapped_vessel_project_id: null,
    disposition: null,
    disposition_reason: null,
    validation_issues: [],
    duplicate_group_key: null,
    created_at: "2036-01-01T00:00:00Z",
    updated_at: "2036-01-01T00:00:00Z",
    ...overrides,
  } as CashImportRowRow;
}

describe("buildCanonicalCommitPreview", () => {
  it("computes the exact 40-row demo reconciliation from the task LOCK", () => {
    const rows: CashImportRowRow[] = [
      row({ id: "opening", provisional_classification: "opening_cash" }),
      row({
        id: "kas",
        vessel_label: "Kas",
        debit: 50_000_000,
        mapping_kind: "cash",
        disposition: "include",
        provisional_classification: "cash_top_up_candidate",
      }),
      row({
        id: "expense",
        vessel_label: "KM Anchor",
        credit: 37_022_700,
        mapping_kind: "existing_vessel_project",
        mapped_vessel_project_id: "project-a",
        disposition: "include",
        provisional_classification: "project_expense_candidate",
      }),
      row({
        id: "refund",
        vessel_label: "KM Anchor",
        debit: 750_000,
        mapping_kind: "existing_vessel_project",
        mapped_vessel_project_id: "project-a",
        disposition: "include",
        provisional_classification: "project_cash_in_or_refund_review",
      }),
      row({
        id: "overhead",
        vessel_label: "Lain-lain",
        credit: 3_975_000,
        mapping_kind: "shared_overhead",
        disposition: "include",
        provisional_classification: "unallocated_expense_review",
      }),
    ];

    const preview = buildCanonicalCommitPreview(
      batch({ opening_balance: 7_870_794, workbook_closing_balance: 17_623_094, calculated_closing_balance: 17_623_094 }),
      rows,
    );

    expect(preview.openingCash).toBe(7_870_794);
    expect(preview.cashTopUpTotal).toBe(50_000_000);
    expect(preview.projectExpenseTotal).toBe(37_022_700);
    expect(preview.projectRefundTotal).toBe(750_000);
    expect(preview.sharedOverheadTotal).toBe(3_975_000);
    expect(preview.netProjectCost).toBe(36_272_700);
    expect(preview.expectedClosingCash).toBe(17_623_094);
    expect(preview.blockers).toEqual([]);
  });

  it("excludes the opening balance row from every bucket", () => {
    const preview = buildCanonicalCommitPreview(batch({ opening_balance: 1_000_000 }), [
      row({ provisional_classification: "opening_cash", debit: 1_000_000 }),
    ]);
    expect(preview.cashTopUpTotal).toBe(0);
    expect(preview.projectExpenseTotal).toBe(0);
  });

  it("reports a skip's variance against the raw source instead of posting it", () => {
    const rows: CashImportRowRow[] = [
      row({ id: "skip", debit: 30_000, mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "project-a", disposition: "skip", disposition_reason: "duplikat" }),
    ];
    const preview = buildCanonicalCommitPreview(batch({}), rows);
    expect(preview.projectRefundTotal).toBe(0);
    expect(preview.skippedDebitTotal).toBe(30_000);
    expect(preview.skippedVarianceFromSource).toBe(30_000);
  });

  it("flags MANUAL_REVIEW_UNRESOLVED and never posts the manual_review row's amount", () => {
    const rows: CashImportRowRow[] = [
      row({ credit: 200_000, mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "project-a", disposition: "manual_review" }),
    ];
    const preview = buildCanonicalCommitPreview(batch({}), rows);
    expect(preview.blockers).toContain("MANUAL_REVIEW_UNRESOLVED");
    expect(preview.projectExpenseTotal).toBe(0);
  });

  it("flags MAPPING_NOT_COMMITTABLE for unresolved included rows", () => {
    const rows: CashImportRowRow[] = [row({ credit: 200_000, mapping_kind: "unresolved", disposition: "include" })];
    const preview = buildCanonicalCommitPreview(batch({}), rows);
    expect(preview.blockers).toContain("MAPPING_NOT_COMMITTABLE");
  });

  it("flags CANDIDATE_PLAN_MISSING (Gate 6I-A) for a new_project_candidate row with no saved plan", () => {
    const rows: CashImportRowRow[] = [
      row({ vessel_label: "KM Baru", credit: 200_000, mapping_kind: "new_project_candidate", disposition: "include" }),
    ];
    const preview = buildCanonicalCommitPreview(batch({}), rows);
    expect(preview.blockers).toContain("CANDIDATE_PLAN_MISSING");
    expect(preview.blockers).not.toContain("MAPPING_NOT_COMMITTABLE");
  });

  it("Gate 6I-A: a new_project_candidate row WITH a saved plan is committable and posts like an existing-project expense", () => {
    const rows: CashImportRowRow[] = [
      row({ vessel_label: "KM Baru", credit: 200_000, mapping_kind: "new_project_candidate", disposition: "include" }),
    ];
    const preview = buildCanonicalCommitPreview(batch({}), rows, false, [
      {
        id: "plan-1",
        tenant_id: "tenant-id",
        batch_id: "batch-id",
        vessel_label: "KM Baru",
        vessel_name: "KM Baru",
        client_id: "client-a",
        service_type_id: "service-a",
        facility_location_id: null,
        start_date: "2036-07-17",
        priority: "standard",
        resolved_vessel_id: null,
        resolved_project_id: null,
        created_by: null,
        created_at: "2036-07-17T00:00:00Z",
        updated_at: "2036-07-17T00:00:00Z",
      },
    ]);
    expect(preview.blockers).not.toContain("CANDIDATE_PLAN_MISSING");
    expect(preview.blockers).not.toContain("MAPPING_NOT_COMMITTABLE");
    expect(preview.projectExpenseTotal).toBe(200_000);
  });

  it("flags MAPPING_INCOMPLETE / DISPOSITION_INCOMPLETE for unset rows", () => {
    const unmapped = buildCanonicalCommitPreview(batch({}), [row({ mapping_kind: null, disposition: "include" })]);
    expect(unmapped.blockers).toContain("MAPPING_INCOMPLETE");

    const unset = buildCanonicalCommitPreview(batch({}), [row({ mapping_kind: "cash", disposition: null })]);
    expect(unset.blockers).toContain("DISPOSITION_INCOMPLETE");
  });

  it("flags VALIDATION_ERRORS_PRESENT and RECONCILIATION_VARIANCE from the batch header", () => {
    const preview = buildCanonicalCommitPreview(
      batch({ error_count: 1, workbook_closing_balance: 100, calculated_closing_balance: 200 }),
      [],
    );
    expect(preview.blockers).toContain("VALIDATION_ERRORS_PRESENT");
    expect(preview.blockers).toContain("RECONCILIATION_VARIANCE");
  });

  it("flags OPENING_BALANCE_CONFLICT when the caller reports an existing financial entry for this business date", () => {
    const preview = buildCanonicalCommitPreview(batch({}), [], true);
    expect(preview.blockers).toContain("OPENING_BALANCE_CONFLICT");
  });

  it("does not flag OPENING_BALANCE_CONFLICT by default (no conflict argument passed)", () => {
    const preview = buildCanonicalCommitPreview(batch({}), []);
    expect(preview.blockers).not.toContain("OPENING_BALANCE_CONFLICT");
  });
});
