import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import { Card } from "@/components/ui/Card";
import { EodReviewRow } from "./EodReviewRow";

export interface EodReviewItem {
  reconciliation: CashPoolReconciliationCurrentRow;
  isLatestForPool: boolean;
  unresolvedExpenseCount: number;
}

export function EodReviewSection({ items }: { items: EodReviewItem[] }) {
  // "Pending" here mirrors EodReviewRow's own canDecide gate — the latest
  // reconciliation per pool still awaiting an owner decision. items itself
  // also includes historical/non-latest reconciliations, so items.length
  // alone would overcount the backlog.
  const pendingCount = items.filter(
    (item) => item.isLatestForPool && item.reconciliation.status === "submitted",
  ).length;

  return (
    <section id="tinjauan-eod">
      <Card tone={pendingCount > 0 ? "warning" : "default"}>
        <h2 className="text-lg font-semibold tracking-tight">4. Tinjauan Rekonsiliasi Akhir Hari (EOD) ({pendingCount})</h2>

        {items.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Belum ada rekonsiliasi kas yang tercatat.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <EodReviewRow key={item.reconciliation.reconciliation_id ?? ""} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
