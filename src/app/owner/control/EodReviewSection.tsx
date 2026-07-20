import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import { EodReviewRow } from "./EodReviewRow";

export interface EodReviewItem {
  reconciliation: CashPoolReconciliationCurrentRow;
  isLatestForPool: boolean;
  unresolvedExpenseCount: number;
}

export function EodReviewSection({ items }: { items: EodReviewItem[] }) {
  return (
    <section id="tinjauan-eod" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">4. Tinjauan Rekonsiliasi Akhir Hari (EOD)</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Belum ada rekonsiliasi kas yang tercatat.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => (
            <EodReviewRow key={item.reconciliation.reconciliation_id ?? ""} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
