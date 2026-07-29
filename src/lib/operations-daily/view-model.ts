import type { CashPoolDailyCloseStatus } from "@/lib/cash-reconciliation/types";
import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
import type { ExpenseSubmissionStatusEventRow } from "@/lib/expense-approvals/repository";
import type { ExpenseSubmissionStatus } from "@/lib/expense-approvals/types";
import type { VesselProjectRow } from "@/lib/vessel-projects/repository";
import type { VesselRow } from "@/lib/master-data/vessels/repository";

export interface VesselProjectOption {
  value: string;
  label: string;
}

function getVesselProjectLabel(project: VesselProjectRow, vesselNameById: Map<string, string>): string {
  const vesselName = vesselNameById.get(project.vessel_id) ?? "Kapal tidak dikenal";
  return project.project_code ? `${vesselName} — ${project.project_code}` : vesselName;
}

// Only active projects may receive a new expense — ready_to_close and
// closed projects are excluded from the picker entirely rather than shown
// disabled, so a stale client cannot even attempt a rejected submission.
export function buildActiveVesselProjectOptions(
  projects: VesselProjectRow[],
  vessels: VesselRow[],
): VesselProjectOption[] {
  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));

  return projects
    .filter((project) => project.lifecycle_status === "active")
    .map((project) => ({ value: project.id, label: getVesselProjectLabel(project, vesselNameById) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Shared overhead can be allocated to any project that could still receive
// it — active or ready_to_close, but never closed nor draft. Explicit
// allow-list (not `!== "closed"`) so a future lifecycle_status value is
// excluded by default until deliberately added here — mirrors allocate_
// shared_overhead_entry's own CANNOT_ALLOCATE_OVERHEAD_TO_INELIGIBLE_PROJECT
// guard (20260729020000...sql §8b), which remains the real enforcement;
// this is UI-only convenience so a stale client can't even attempt a
// rejected allocation. Broader than buildActiveVesselProjectOptions on
// purpose (still excludes draft, same as that one).
const ALLOCATABLE_OVERHEAD_LIFECYCLE_STATUSES: ReadonlySet<VesselProjectRow["lifecycle_status"]> = new Set([
  "active",
  "ready_to_close",
]);

export function buildAllocatableVesselProjectOptions(
  projects: VesselProjectRow[],
  vessels: VesselRow[],
): VesselProjectOption[] {
  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));

  return projects
    .filter((project) => ALLOCATABLE_OVERHEAD_LIFECYCLE_STATUSES.has(project.lifecycle_status))
    .map((project) => ({ value: project.id, label: getVesselProjectLabel(project, vesselNameById) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Unfiltered label lookup (draft usable for every lifecycle status) — used
// to render existing submissions whose project may since have moved to
// ready_to_close/closed, not just the ones still eligible for a new expense.
export function buildVesselProjectLabelMap(projects: VesselProjectRow[], vessels: VesselRow[]): Map<string, string> {
  const vesselNameById = new Map(vessels.map((vessel) => [vessel.id, vessel.vessel_name]));
  return new Map(projects.map((project) => [project.id, getVesselProjectLabel(project, vesselNameById)]));
}

// The pool must exist and be open before opening-cash/top-up/other-cash-in
// entries may be recorded — pending_close and closed both lock new
// financial entries (matches the record_cash_pool_entry RPC's own guard).
export function isCashPoolOpenForMutation(
  pool: { daily_close_status: CashPoolDailyCloseStatus } | null,
): boolean {
  return pool !== null && pool.daily_close_status === "open";
}

// Surfaces the client-side reason an EOD close cannot be submitted yet;
// the server RPC remains the authoritative gate (UNRESOLVED_EXPENSES /
// invalid-status errors), this only avoids letting the admin submit a
// request that is guaranteed to fail.
export function getEodCloseBlockedReason(params: {
  pool: { daily_close_status: CashPoolDailyCloseStatus } | null;
  unresolvedExpenseCount: number;
}): string | null {
  const { pool, unresolvedExpenseCount } = params;
  if (!pool) {
    return "Kas hari ini belum dibuka.";
  }
  if (pool.daily_close_status === "closed") {
    return "Kas hari ini sudah ditutup.";
  }
  if (unresolvedExpenseCount > 0) {
    return "Masih ada pengajuan biaya yang belum memiliki keputusan final. Selesaikan pengajuan tersebut terlebih dahulu.";
  }
  return null;
}

// A submission is flagged for the "perlu pemeriksaan duplikasi" warning
// whenever it appears on either side of a still-pending duplicate
// candidate — resolved candidates (not_duplicate / confirmed_duplicate) are
// excluded here since admin's warning is about candidates still awaiting
// owner review.
export function getSubmissionIdsWithPendingDuplicates(
  candidates: ExpenseDuplicateCandidateCurrentRow[],
): Set<string> {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.status !== "pending") continue;
    if (candidate.submission_id_1) ids.add(candidate.submission_id_1);
    if (candidate.submission_id_2) ids.add(candidate.submission_id_2);
  }
  return ids;
}

// Owner decision reason shown alongside a rejected/needs_correction
// submission — the most recent status-transition event that landed on the
// submission's current status carries the reason the owner gave.
export function getLatestReasonForStatus(
  events: ExpenseSubmissionStatusEventRow[],
  status: ExpenseSubmissionStatus,
): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].to_status === status) {
      return events[i].reason;
    }
  }
  return null;
}
