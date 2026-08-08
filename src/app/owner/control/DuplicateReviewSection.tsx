import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";
import { Card } from "@/components/ui/Card";
import { SectionIcon } from "./SectionIcon";
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

export function DuplicateReviewSection({ items }: { items: DuplicateReviewItem[] }) {
  return (
    <section id="tinjauan-duplikasi">
      <Card tone={items.length > 0 ? "warning" : "default"}>
        <div className="flex items-center gap-2.5">
          <SectionIcon tone={items.length > 0 ? "warning" : "neutral"} kind="duplicate" />
          <h2 className="text-lg font-semibold tracking-tight">3. Tinjauan Kandidat Duplikasi ({items.length})</h2>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Kandidat duplikasi hanya indikasi, bukan bukti kecurangan — setiap kandidat membutuhkan keputusan Anda.
        </p>

        {items.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Tidak ada kandidat duplikasi yang menunggu keputusan.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item) => (
              <DuplicateReviewRow key={item.candidate.candidate_id ?? ""} item={item} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
