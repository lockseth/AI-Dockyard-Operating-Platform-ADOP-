import type { ExpenseSubmissionCurrentRow, ExpenseSubmissionRevisionRow } from "@/lib/expense-approvals/repository";
import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
import { ApprovalGroupCard } from "./ApprovalGroupCard";
import { ExpenseReviewRow } from "./ExpenseReviewRow";

export interface ExpenseReviewItem {
  submission: ExpenseSubmissionCurrentRow;
  businessDate: string | null;
  projectLabel: string;
  categoryLabel: string;
  vendorLabel: string | null;
  revisionHistory: ExpenseSubmissionRevisionRow[];
  duplicateCandidates: ExpenseDuplicateCandidateCurrentRow[];
}

export function ExpenseReviewSection({ items }: { items: ExpenseReviewItem[] }) {
  return (
    <section id="tinjauan-biaya">
      <ApprovalGroupCard
        icon="expense"
        title={`2. Tinjauan Pengajuan Biaya (${items.length})`}
        pendingCount={items.length}
      >
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Tidak ada pengajuan biaya yang menunggu review.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ExpenseReviewRow key={item.submission.submission_id ?? ""} item={item} />
            ))}
          </ul>
        )}
      </ApprovalGroupCard>
    </section>
  );
}
