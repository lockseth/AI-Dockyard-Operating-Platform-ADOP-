export const SHARED_OVERHEAD_ALLOCATION_STATUS_LABEL: Record<string, string> = {
  unallocated: "Belum Dialokasikan",
  partially_allocated: "Sebagian Dialokasikan",
  fully_allocated: "Sudah Dialokasikan",
};

export function getSharedOverheadAllocationStatusLabel(status: string | null): string {
  if (!status) return "-";
  return SHARED_OVERHEAD_ALLOCATION_STATUS_LABEL[status] ?? status;
}
