import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";
import { getCashImportBatchStatusBanner } from "@/lib/cash-import-staging/status-banner";

const TONE_CLASS: Record<string, string> = {
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  informational: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  neutral:
    "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
};

export function BatchStatusBanner({ status }: { status: CashImportBatchRow["status"] }) {
  const banner = getCashImportBatchStatusBanner(status);
  return (
    <div
      role="status"
      className={`w-fit rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${TONE_CLASS[banner.tone]}`}
    >
      {banner.message}
    </div>
  );
}
