import type { Tone } from "./tone";

const BADGE_TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const DOT_TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-600 dark:bg-emerald-400",
  warning: "bg-amber-600 dark:bg-amber-400",
  danger: "bg-red-600 dark:bg-red-400",
  neutral: "bg-neutral-500 dark:bg-neutral-400",
  info: "bg-blue-600 dark:bg-blue-400",
};

// `dot` renders a small leading status dot (design-system badge spec) —
// never the sole signal, always paired with the existing text label.
export function Badge({
  tone,
  dot = false,
  children,
  className = "",
}: {
  tone: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES[tone]} ${className}`}
    >
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_TONE_CLASSES[tone]}`} /> : null}
      {children}
    </span>
  );
}
