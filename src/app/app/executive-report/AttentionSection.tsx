import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { Tone } from "@/components/ui/tone";
import { TextLink } from "@/components/ui/TextLink";
import { EXECUTIVE_ATTENTION_TAG_LABEL, EXECUTIVE_ATTENTION_TAG_TONE } from "@/lib/executive-report/labels";
import type { ExecutiveAttentionItem, ExecutiveAttentionTag } from "@/lib/executive-report/types";
import { formatRupiah } from "@/lib/operations-daily/format";

// Bounded preview — the real total count is shown separately
// (attentionTotalCount, rendered by the caller) so this cap never reads as
// "the total is N"; "Lihat Semua" points at Billing Workspace, the existing
// unbounded list, rather than duplicating one here. Founder Visual UAT R2:
// 5 (not 8) keeps the page scannable; each row also dropped its full-amber
// background — every item here already needed attention by definition, so
// tinting every row the same amber no longer carried information. A neutral
// card + a left accent strip sized to the row's most severe tag (same
// "strip, not full-bleed" pattern as Owner Control's billing attention
// card) does the same job without flattening the whole list to one color.
const PREVIEW_LIMIT = 5;

const STRIP_TONE_CLASSES: Record<Tone, string> = {
  danger: "bg-red-500 dark:bg-red-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  info: "bg-blue-500 dark:bg-blue-400",
  success: "bg-emerald-500 dark:bg-emerald-400",
  neutral: "bg-neutral-300 dark:bg-neutral-600",
};

// danger > warning > info — the row's strip reflects its single worst tag,
// not every tag it carries (the badges below already show all of them).
const TONE_SEVERITY: Tone[] = ["danger", "warning", "info", "neutral", "success"];

function dominantTone(tags: ExecutiveAttentionTag[]): Tone {
  const tones = tags.map((tag) => EXECUTIVE_ATTENTION_TAG_TONE[tag]);
  return TONE_SEVERITY.find((tone) => tones.includes(tone)) ?? "neutral";
}

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
      {preview.map((item) => {
        const strip = STRIP_TONE_CLASSES[dominantTone(item.tags)];
        return (
          <TextLink
            key={item.projectId}
            href={item.traceUrl}
            // TextLink's base classes always include `underline` — Tailwind's
            // generated order puts it after `no-underline` in this build, so
            // the plain utility loses the cascade (previously masked by the
            // full-amber row background; visible now that rows are neutral).
            // `!no-underline` (important modifier) wins regardless of
            // generation order — scoped to this row link only, TextLink
            // itself is untouched.
            className="block !no-underline"
          >
            <Card className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${strip}`} />
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
                <span
                  className={`shrink-0 text-sm tabular-nums ${
                    item.amount > 0
                      ? "font-semibold text-neutral-900 dark:text-neutral-50"
                      : "font-normal text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {formatRupiah(item.amount)}
                </span>
              ) : null}
            </Card>
          </TextLink>
        );
      })}
      {items.length > PREVIEW_LIMIT ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Menampilkan {preview.length} dari {items.length} item.{" "}
          <TextLink href="/billing/workspace" tone="brand" className="text-xs font-medium">
            Lihat Semua di Billing Workspace
          </TextLink>
        </p>
      ) : null}
    </div>
  );
}
