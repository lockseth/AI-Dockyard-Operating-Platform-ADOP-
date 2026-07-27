import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import { EXECUTIVE_ATTENTION_TAG_LABEL, EXECUTIVE_ATTENTION_TAG_TONE } from "@/lib/executive-report/labels";
import type { ExecutiveAttentionItem } from "@/lib/executive-report/types";
import { formatRupiah } from "@/lib/operations-daily/format";

// Bounded preview — the real total count is shown separately
// (attentionTotalCount, rendered by the caller) so this cap never reads as
// "the total is N"; "Lihat Semua" points at Billing Workspace, the existing
// unbounded list, rather than duplicating one here.
const PREVIEW_LIMIT = 8;

export function AttentionSection({ items }: { items: ExecutiveAttentionItem[] }) {
  if (items.length === 0) {
    return (
      <Card tone="success" className="text-sm text-neutral-600 dark:text-neutral-300">
        Tidak ada item yang memerlukan perhatian saat ini.
      </Card>
    );
  }

  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col gap-3">
      {preview.map((item) => (
        <TextLink key={item.projectId} href={item.traceUrl} className="block no-underline">
          <Card
            tone="warning"
            className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:brightness-[0.98]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.label}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <Badge key={tag} tone={EXECUTIVE_ATTENTION_TAG_TONE[tag]}>
                    {EXECUTIVE_ATTENTION_TAG_LABEL[tag]}
                  </Badge>
                ))}
              </div>
            </div>
            {item.amount !== null ? (
              <span className="shrink-0 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                {formatRupiah(item.amount)}
              </span>
            ) : null}
          </Card>
        </TextLink>
      ))}
      {items.length > PREVIEW_LIMIT ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Menampilkan {preview.length} dari {items.length} item.{" "}
          <TextLink href="/billing/workspace" className="text-xs font-medium">
            Lihat Semua di Billing Workspace
          </TextLink>
        </p>
      ) : null}
    </div>
  );
}
