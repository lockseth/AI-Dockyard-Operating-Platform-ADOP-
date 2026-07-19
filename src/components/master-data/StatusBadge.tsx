import type { RecordStatus } from "@/lib/master-data/shared/types";

export function StatusBadge({ status }: { status: RecordStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {isActive ? "Aktif" : "Nonaktif"}
    </span>
  );
}
