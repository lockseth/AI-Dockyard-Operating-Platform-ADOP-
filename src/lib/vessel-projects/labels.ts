import type { VesselProjectLifecycleStatus, VesselProjectPriority } from "./types";

const LIFECYCLE_STATUS_LABELS: Record<VesselProjectLifecycleStatus, string> = {
  active: "Aktif",
  ready_to_close: "Siap Ditutup",
  closed: "Ditutup",
};

export function getVesselProjectLifecycleStatusLabel(status: VesselProjectLifecycleStatus): string {
  return LIFECYCLE_STATUS_LABELS[status] ?? status;
}

const PRIORITY_LABELS: Record<VesselProjectPriority, string> = {
  emergency: "Emergency",
  standard: "Standard",
  urgent: "Urgent",
};

export function getVesselProjectPriorityLabel(priority: VesselProjectPriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}
