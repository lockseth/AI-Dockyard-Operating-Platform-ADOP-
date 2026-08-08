import { TextLink } from "@/components/ui/TextLink";
import { formatBusinessDateLabel } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";
import { ApprovalGroupCard } from "./ApprovalGroupCard";

// Discoverability only — the actual approve/reject controls live on the
// batch detail page (/operations/import/[batchId]), which already has the
// full staging context (mapping, dispositions, duplicate decisions,
// canonical preview) an owner needs to decide. This section just surfaces
// which batches are waiting.
//
// R2: this group now always renders (collapsed, like the other three
// approval groups) instead of returning null at zero pending — R1 hid it
// entirely, which made the approval backlog's visible group count vary
// (3 or 4) depending on import activity. Founder UAT R2 asked for a
// consistent, predictable collapsed-by-default set of four groups.
export function CashImportApprovalSection({ batches }: { batches: CashImportBatchRow[] }) {
  const pending = batches.filter((batch) => batch.status === "ready_for_review");

  return (
    <section id="import-kas">
      <ApprovalGroupCard
        icon="import"
        title={`Import Kas Menunggu Persetujuan (${pending.length})`}
        pendingCount={pending.length}
      >
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-500">Tidak ada batch import yang menunggu persetujuan.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {pending.map((batch) => (
              <li
                key={batch.id}
                className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900"
              >
                <div>
                  <p className="font-medium">{batch.source_filename}</p>
                  <p className="text-xs text-neutral-500">{formatBusinessDateLabel(batch.business_date)}</p>
                </div>
                <TextLink href={`/operations/import/${batch.id}`} tone="brand" className="text-xs">
                  Review &amp; Setujui
                </TextLink>
              </li>
            ))}
          </ul>
        )}
      </ApprovalGroupCard>
    </section>
  );
}
