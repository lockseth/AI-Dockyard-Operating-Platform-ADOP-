import { describe, expect, it } from "vitest";
import { summarizeCashImportLabels } from "./label-summary";
import type { CashImportRowRow } from "./repository";

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

describe("summarizeCashImportLabels", () => {
  it("excludes the opening balance row", () => {
    const rows = [row({ provisional_classification: "opening_cash", vessel_label: null })];
    expect(summarizeCashImportLabels(rows)).toHaveLength(0);
  });

  it("groups rows by vessel_label, including a null-label group", () => {
    const rows = [
      row({ id: "1", vessel_label: "Kas" }),
      row({ id: "2", vessel_label: "Kas" }),
      row({ id: "3", vessel_label: null }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary).toHaveLength(2);
    const kas = summary.find((s) => s.vesselLabel === "Kas");
    expect(kas?.rowCount).toBe(2);
    const nullGroup = summary.find((s) => s.vesselLabel === null);
    expect(nullGroup?.rowCount).toBe(1);
  });

  it("suggests cash for Kas and reports mappingKind null when unset", () => {
    const rows = [row({ id: "1", vessel_label: "Kas", mapping_kind: null })];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].suggestedMappingKind).toBe("cash");
    expect(summary[0].mappingKind).toBeNull();
    expect(summary[0].unmappedCount).toBe(1);
  });

  it("reports a consistent mappingKind once every row in the group is mapped the same way", () => {
    const rows = [
      row({ id: "1", vessel_label: "KM Sejahtera", mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "proj-1" }),
      row({ id: "2", vessel_label: "KM Sejahtera", mapping_kind: "existing_vessel_project", mapped_vessel_project_id: "proj-1" }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].mappingKind).toBe("existing_vessel_project");
    expect(summary[0].mappedVesselProjectId).toBe("proj-1");
    expect(summary[0].unmappedCount).toBe(0);
  });

  it("reports mappingKind null when rows in the same group disagree (mixed/transient state)", () => {
    const rows = [
      row({ id: "1", vessel_label: "KM Sejahtera", mapping_kind: "cash" }),
      row({ id: "2", vessel_label: "KM Sejahtera", mapping_kind: "shared_overhead" }),
    ];
    const summary = summarizeCashImportLabels(rows);
    expect(summary[0].mappingKind).toBeNull();
  });
});
