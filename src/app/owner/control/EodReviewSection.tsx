import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";
import { ApprovalGroupCard } from "./ApprovalGroupCard";
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
      <ApprovalGroupCard
        icon="eod"
        title={`4. Tinjauan Rekonsiliasi Akhir Hari (EOD) (${pendingCount})`}
        pendingCount={pendingCount}
      >
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Belum ada rekonsiliasi kas yang tercatat.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <EodReviewRow key={item.reconciliation.reconciliation_id ?? ""} item={item} />
            ))}
          </ul>
        )}
      </ApprovalGroupCard>
    </section>
  );
}
