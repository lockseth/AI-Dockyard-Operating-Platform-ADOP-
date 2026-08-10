"use client";

import { useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { Tone } from "@/components/ui/tone";
import { SectionIconChip, type SectionIconKind } from "./SectionIcon";

// Same shape as Card's own default tone (rounded-xl border shadow-sm,
// neutral-200/neutral-950 border+bg) — a plain div instead of <Card> because
// this header needs its own px-4/py-3.5 rhythm instead of Card's fixed p-5,
// and Tailwind's generated stylesheet order does not reliably let a later
// `className` override an earlier utility of the same CSS property (verified:
// `<Card className="p-0">` still computes 20px padding, not 0) — so the two
// padding schemes can't coexist on the same element via prop override.
const GROUP_CARD_SHELL_CLASSES =
  "rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950";

// Group-level collapse for Owner Control's four approval backlogs (Import
// Kas, Tinjauan Pengajuan Biaya, Tinjauan Duplikasi, Tinjauan EOD) — always
// starts collapsed regardless of pending count (Founder UAT R1: the fully-
// expanded item lists made the page too long to scan). Mirrors the shared
// Disclosure component's aria-expanded/aria-controls + `hidden` attribute
// pattern (content stays mounted, never unmounted, so nothing inside an
// open item is lost by collapsing its parent group), just with its own
// icon-chip + status-badge header layout instead of Disclosure's plain text
// trigger — kept local to Owner Control rather than folded into the shared
// Disclosure since the icon-chip/badge header shape isn't needed by
// Disclosure's other ~15 call sites.
export function ApprovalGroupCard({
  icon,
  title,
  description,
  pendingCount,
  children,
}: {
  icon: SectionIconKind;
  title: string;
  description?: string;
  pendingCount: number;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const tone: Tone = pendingCount > 0 ? "warning" : "success";

  return (
    <div className={GROUP_CARD_SHELL_CLASSES}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
      >
        <SectionIconChip kind={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>
            {pendingCount > 0 ? (
              <Badge tone="warning" dot>
                Perlu review
              </Badge>
            ) : (
              <Badge tone="success">Tidak ada pending</Badge>
            )}
          </span>
          {description ? (
            <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">{description}</span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      <div id={contentId} hidden={!open} className="border-t border-neutral-200 px-4 pt-3 pb-4 dark:border-neutral-800">
        {children}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}
