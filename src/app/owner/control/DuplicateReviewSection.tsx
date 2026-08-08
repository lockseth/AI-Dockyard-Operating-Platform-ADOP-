import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
import { ApprovalGroupCard } from "./ApprovalGroupCard";
import { DuplicateReviewRow } from "./DuplicateReviewRow";

export interface DuplicateReviewItem {
  candidate: ExpenseDuplicateCandidateCurrentRow;
  businessDate1: string | null;
  businessDate2: string | null;
  projectLabel1: string;
  projectLabel2: string;
  categoryLabel1: string;
  categoryLabel2: string;
  vendorLabel1: string | null;
  vendorLabel2: string | null;
}

const DUPLICATE_NOTE = "Kandidat duplikasi hanya indikasi, bukan bukti kecurangan — setiap kandidat membutuhkan keputusan Anda.";

export function DuplicateReviewSection({ items }: { items: DuplicateReviewItem[] }) {
  return (
    <section id="tinjauan-duplikasi">
      <ApprovalGroupCard
        icon="duplicate"
        title={`3. Tinjauan Kandidat Duplikasi (${items.length})`}
        description={DUPLICATE_NOTE}
        pendingCount={items.length}
      >
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">{DUPLICATE_NOTE}</p>

        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Tidak ada kandidat duplikasi yang menunggu keputusan.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <DuplicateReviewRow key={item.candidate.candidate_id ?? ""} item={item} />
            ))}
          </ul>
        )}
      </ApprovalGroupCard>
    </section>
  );
}
