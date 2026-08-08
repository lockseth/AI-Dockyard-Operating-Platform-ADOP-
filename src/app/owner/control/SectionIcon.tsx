import type { Tone } from "@/components/ui/tone";

// Small leading glyph for Owner Control's approval section headers — purely
// decorative wayfinding (aria-hidden), same tone token set as Badge/Card so
// a "warning" section reads amber consistently across icon + card border.
const ICON_TONE_CLASSES: Record<Tone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  neutral: "text-neutral-400 dark:text-neutral-500",
  info: "text-blue-600 dark:text-blue-400",
};

export type SectionIconKind = "expense" | "duplicate" | "eod" | "import" | "vessel" | "billing";

export function SectionIcon({ kind, tone }: { kind: SectionIconKind; tone: Tone }) {
  return (
    <span aria-hidden className={`shrink-0 ${ICON_TONE_CLASSES[tone]}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        {ICON_PATHS[kind]}
      </svg>
    </span>
  );
}

// Sharp/minimal-radius chip (rounded-lg, not a circle) behind an icon — same
// tone token set as Badge, shared by every Owner Control surface that pairs
// a colored icon container with a value (approval group headers, KPI action
// tiles, the billing attention card, project watchlist rows).
export const ICON_CONTAINER_TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const CHIP_SIZE_CLASSES = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-11 w-11" } as const;

export function SectionIconChip({
  kind,
  tone,
  size = "md",
}: {
  kind: SectionIconKind;
  tone: Tone;
  size?: keyof typeof CHIP_SIZE_CLASSES;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg ${CHIP_SIZE_CLASSES[size]} ${ICON_CONTAINER_TONE_CLASSES[tone]}`}
    >
      <SectionIcon kind={kind} tone={tone} />
    </span>
  );
}

const ICON_PATHS: Record<SectionIconKind, React.ReactNode> = {
  expense: (
    <path
      d="M4 6h16M4 12h16M4 18h10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  eod: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  import: (
    <path
      d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  vessel: (
    <path
      d="M4 15h16l-1.8 4.2a2 2 0 0 1-1.84 1.3H7.64a2 2 0 0 1-1.84-1.3L4 15Zm2-4V6a1 1 0 0 1 1-1h3v6M13 5v6m5 4V9.5a1 1 0 0 0-.4-.8L13 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  billing: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};
