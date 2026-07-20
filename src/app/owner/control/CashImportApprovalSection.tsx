import Link from "next/link";
import { formatBusinessDateLabel } from "@/lib/operations-daily/format";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

// Discoverability only — the actual approve/reject controls live on the
// batch detail page (/operations/import/[batchId]), which already has the
// full staging context (mapping, dispositions, duplicate decisions,
// canonical preview) an owner needs to decide. This section just surfaces
// which batches are waiting.
export function CashImportApprovalSection({ batches }: { batches: CashImportBatchRow[] }) {
  const pending = batches.filter((batch) => batch.status === "ready_for_review");

  if (pending.length === 0) {
    return null;
  }

  return (
    <section id="import-kas" className="rounded-lg border border-neutral-200 p-6 dark:border-neutral-800">
      <h2 className="text-lg font-semibold tracking-tight">Import Kas Menunggu Persetujuan ({pending.length})</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {pending.map((batch) => (
          <li
            key={batch.id}
            className="flex items-center justify-between gap-4 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900"
          >
            <div>
              <p className="font-medium">{batch.source_filename}</p>
              <p className="text-xs text-neutral-500">{formatBusinessDateLabel(batch.business_date)}</p>
            </div>
            <Link
              href={`/operations/import/${batch.id}`}
              className="text-xs underline underline-offset-4 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              Review &amp; Setujui
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
