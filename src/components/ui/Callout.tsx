import type { Tone } from "./tone";

const CALLOUT_TONE_CLASSES: Record<Tone, string> = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  danger: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400",
  info: "border-adop-accent-200 bg-adop-accent-50 text-adop-accent-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300",
};

export function Callout({
  tone,
  title,
  titleClassName = "text-sm font-medium",
  children,
  className = "",
  role,
}: {
  tone: Tone;
  title?: React.ReactNode;
  // The wrapper deliberately carries no font-size utility of its own — only
  // `className` (the caller's body-text size, e.g. "text-xs") sets it, so
  // there is never a same-element clash between two conflicting Tailwind
  // text-size classes (whose winner would depend on Tailwind's internal
  // stylesheet order, not on className string order — a real, silent bug
  // caught during the domain/UI-separation audit). The title has its own
  // independent size instead, since some callers want a title visibly
  // larger than the body (text-sm over text-xs body) while others want the
  // title and body to match — override per call site, don't rely on
  // inheritance from the wrapper.
  titleClassName?: string;
  children?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className={`rounded-md border p-3 ${CALLOUT_TONE_CLASSES[tone]} ${className}`}>
      {title ? <p className={titleClassName}>{title}</p> : null}
      {children}
    </div>
  );
}
