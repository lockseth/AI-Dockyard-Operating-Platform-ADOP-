// Single source of truth for every status/tone-based color used across
// badges, callouts, and inline indicators. Changing a color here changes it
// everywhere at once — no file should hand-roll its own
// "bg-emerald-100 text-emerald-800 dark:..." string.
export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

// For plain colored text (a stat value, an inline note) where a full
// Badge/Callout shape doesn't fit — same token set, just text-only.
export const TEXT_TONE_CLASSES: Record<Tone, string> = {
  success: "text-emerald-700 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  danger: "text-red-700 dark:text-red-400",
  neutral: "text-neutral-500 dark:text-neutral-400",
  info: "text-blue-700 dark:text-blue-400",
};
