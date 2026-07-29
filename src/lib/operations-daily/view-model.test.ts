import { describe, expect, it } from "vitest";
import {
  buildActiveVesselProjectOptions,
  buildAllocatableVesselProjectOptions,
  buildVesselProjectLabelMap,
  getEodCloseBlockedReason,
  getLatestReasonForStatus,
  getSubmissionIdsWithPendingDuplicates,
  isCashPoolOpenForMutation,
} from "./view-model";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";
import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
import type { ExpenseSubmissionStatusEventRow } from "@/lib/expense-approvals/repository";

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

describe("buildActiveVesselProjectOptions", () => {
  it("excludes ready_to_close and closed projects", () => {
    const projects = [
      project({ id: "p-active", lifecycle_status: "active" }),
      project({ id: "p-ready", lifecycle_status: "ready_to_close" }),
      project({ id: "p-closed", lifecycle_status: "closed" }),
    ];
    const options = buildActiveVesselProjectOptions(projects, [vessel({})]);
    expect(options.map((o) => o.value)).toEqual(["p-active"]);
  });

  it("labels with vessel name and project code when present", () => {
    const options = buildActiveVesselProjectOptions(
      [project({ id: "p-1", vessel_id: "v-1", project_code: "DOCK-01" })],
      [vessel({ id: "v-1", vessel_name: "MV Sejahtera" })],
    );
    expect(options).toEqual([{ value: "p-1", label: "MV Sejahtera — DOCK-01" }]);
  });

  it("falls back to vessel name only when project code is absent", () => {
    const options = buildActiveVesselProjectOptions(
      [project({ id: "p-1", vessel_id: "v-1", project_code: null })],
      [vessel({ id: "v-1", vessel_name: "MV Sejahtera" })],
    );
    expect(options).toEqual([{ value: "p-1", label: "MV Sejahtera" }]);
  });

  it("uses a placeholder label when the vessel is missing from the lookup", () => {
    const options = buildActiveVesselProjectOptions([project({ id: "p-1", vessel_id: "missing" })], []);
    expect(options[0].label).toBe("Kapal tidak dikenal");
  });
});

// Gate 6I-A corrective: draft (import-candidate-only, incomplete) is
// excluded from normal Shared Overhead allocation targets alongside closed
// — explicit active/ready_to_close allow-list, not a `!== "closed"`
// deny-list, so a future lifecycle_status value is excluded by default.
describe("buildAllocatableVesselProjectOptions", () => {
  it("excludes draft and closed, includes active and ready_to_close", () => {
    const projects = [
      project({ id: "p-draft", lifecycle_status: "draft" }),
      project({ id: "p-active", lifecycle_status: "active" }),
      project({ id: "p-ready", lifecycle_status: "ready_to_close" }),
      project({ id: "p-closed", lifecycle_status: "closed" }),
    ];
    const options = buildAllocatableVesselProjectOptions(projects, [vessel({})]);
    expect(options.map((o) => o.value).sort()).toEqual(["p-active", "p-ready"]);
  });
});

describe("buildVesselProjectLabelMap", () => {
  it("includes projects regardless of lifecycle status", () => {
    const map = buildVesselProjectLabelMap(
      [
        project({ id: "p-active", lifecycle_status: "active", vessel_id: "v-1", project_code: "A" }),
        project({ id: "p-closed", lifecycle_status: "closed", vessel_id: "v-1", project_code: "B" }),
      ],
      [vessel({ id: "v-1", vessel_name: "MV Sejahtera" })],
    );
    expect(map.get("p-active")).toBe("MV Sejahtera — A");
    expect(map.get("p-closed")).toBe("MV Sejahtera — B");
  });
});

describe("isCashPoolOpenForMutation", () => {
  it("is false when no pool has been created yet", () => {
    expect(isCashPoolOpenForMutation(null)).toBe(false);
  });

  it("is true only when the pool status is open", () => {
    expect(isCashPoolOpenForMutation({ daily_close_status: "open" })).toBe(true);
    expect(isCashPoolOpenForMutation({ daily_close_status: "pending_close" })).toBe(false);
    expect(isCashPoolOpenForMutation({ daily_close_status: "closed" })).toBe(false);
  });
});

describe("getEodCloseBlockedReason", () => {
  it("blocks when no pool exists", () => {
    expect(getEodCloseBlockedReason({ pool: null, unresolvedExpenseCount: 0 })).toBe(
      "Kas hari ini belum dibuka.",
    );
  });

  it("blocks when the pool is already closed", () => {
    expect(
      getEodCloseBlockedReason({ pool: { daily_close_status: "closed" }, unresolvedExpenseCount: 0 }),
    ).toBe("Kas hari ini sudah ditutup.");
  });

  it("blocks when there are unresolved expenses", () => {
    expect(
      getEodCloseBlockedReason({ pool: { daily_close_status: "open" }, unresolvedExpenseCount: 2 }),
    ).toMatch(/belum memiliki keputusan final/);
  });

  it("allows close when the pool is open and no expenses are unresolved", () => {
    expect(
      getEodCloseBlockedReason({ pool: { daily_close_status: "open" }, unresolvedExpenseCount: 0 }),
    ).toBeNull();
  });

  it("allows close when the pool is pending_close and no expenses are unresolved", () => {
    expect(
      getEodCloseBlockedReason({ pool: { daily_close_status: "pending_close" }, unresolvedExpenseCount: 0 }),
    ).toBeNull();
  });
});

describe("getSubmissionIdsWithPendingDuplicates", () => {
  function candidate(overrides: Partial<ExpenseDuplicateCandidateCurrentRow>): ExpenseDuplicateCandidateCurrentRow {
    return {
      candidate_id: "c-1",
      tenant_id: "tenant-1",
      submission_id_1: "sub-1",
      submission_id_2: "sub-2",
      status: "pending",
      reason_code: "exact_financial_match",
      detected_at: "2026-07-20T00:00:00Z",
      amount_1: 100000,
      amount_2: 100000,
      category_id_1: null,
      category_id_2: null,
      description_1: null,
      description_2: null,
      match_evidence: null,
      project_id_1: null,
      project_id_2: null,
      reference_number_1: null,
      reference_number_2: null,
      resolved_at: null,
      resolved_by: null,
      resolved_reason: null,
      revision_number_1: null,
      revision_number_2: null,
      submission_status_1: null,
      submission_status_2: null,
      vendor_id_1: null,
      vendor_id_2: null,
      ...overrides,
    } as ExpenseDuplicateCandidateCurrentRow;
  }

  it("collects submission ids from pending candidates on both sides", () => {
    const ids = getSubmissionIdsWithPendingDuplicates([
      candidate({ submission_id_1: "sub-a", submission_id_2: "sub-b" }),
    ]);
    expect(ids).toEqual(new Set(["sub-a", "sub-b"]));
  });

  it("ignores resolved candidates", () => {
    const ids = getSubmissionIdsWithPendingDuplicates([
      candidate({ status: "not_duplicate", submission_id_1: "sub-a", submission_id_2: "sub-b" }),
    ]);
    expect(ids.size).toBe(0);
  });

  it("ignores null submission ids", () => {
    const ids = getSubmissionIdsWithPendingDuplicates([
      candidate({ submission_id_1: null, submission_id_2: "sub-b" }),
    ]);
    expect(ids).toEqual(new Set(["sub-b"]));
  });
});

describe("getLatestReasonForStatus", () => {
  function event(overrides: Partial<ExpenseSubmissionStatusEventRow>): ExpenseSubmissionStatusEventRow {
    return {
      id: "event-1",
      tenant_id: "tenant-1",
      submission_id: "sub-1",
      revision_id: null,
      actor_user_id: null,
      from_status: "submitted",
      to_status: "needs_correction",
      reason: null,
      created_at: "2026-07-20T00:00:00Z",
      ...overrides,
    } as ExpenseSubmissionStatusEventRow;
  }

  it("returns the reason from the most recent event landing on the target status", () => {
    const events = [
      event({ to_status: "needs_correction", reason: "Nota kurang jelas", created_at: "2026-07-19T00:00:00Z" }),
      event({ to_status: "submitted", reason: null, created_at: "2026-07-19T01:00:00Z" }),
      event({ to_status: "needs_correction", reason: "Nominal tidak sesuai", created_at: "2026-07-20T00:00:00Z" }),
    ];
    expect(getLatestReasonForStatus(events, "needs_correction")).toBe("Nominal tidak sesuai");
  });

  it("returns null when no event lands on the target status", () => {
    const events = [event({ to_status: "submitted", reason: null })];
    expect(getLatestReasonForStatus(events, "rejected")).toBeNull();
  });

  it("returns null for an empty event list", () => {
    expect(getLatestReasonForStatus([], "rejected")).toBeNull();
  });
});
