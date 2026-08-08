import type { ExpenseSubmissionCurrentRow, ExpenseSubmissionRevisionRow } from "@/lib/expense-approvals/repository";
import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
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
    <section id="tinjauan-biaya" className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">2. Tinjauan Pengajuan Biaya ({items.length})</h2>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Tidak ada pengajuan biaya yang menunggu review.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <ExpenseReviewRow key={item.submission.submission_id ?? ""} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
