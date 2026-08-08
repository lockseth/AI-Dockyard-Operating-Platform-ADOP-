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

export type SectionIconKind = "expense" | "duplicate" | "eod" | "import";

export function SectionIcon({ kind, tone }: { kind: SectionIconKind; tone: Tone }) {
  return (
    <span aria-hidden className={`shrink-0 ${ICON_TONE_CLASSES[tone]}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        {ICON_PATHS[kind]}
      </svg>
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
};
