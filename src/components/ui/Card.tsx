const TONE_CLASSES = {
  default: "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950",
  // Reserved for owner-tier callouts (LOCK: Gold / Owner Action surface).
  owner: "border-[#e6cf94] bg-[#fdf9f0] dark:border-brand-gold/40 dark:bg-neutral-950",
  // Same success/warning/danger/neutral/info tone set as Badge/Callout
  // (components/ui/tone.ts), as a full tinted card surface — used for
  // "needs attention" style panels (e.g. Dashboard's Perlu Tindakan).
  success: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  danger: "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30",
  neutral: "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40",
  info: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
} as const;

export function Card({
  tone = "default",
  className = "",
  children,
  ...rest
}: {
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${TONE_CLASSES[tone]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardEyebrow({ tone = "default", children }: { tone?: "default" | "owner"; children: React.ReactNode }) {
  return (
    <div
      className={`text-[11px] font-bold uppercase tracking-wider ${
        tone === "owner" ? "text-[#a97f2f]" : "text-neutral-500 dark:text-neutral-400"
      }`}
    >
      {children}
    </div>
  );
}

// KPI/stat tile — label, a large figure, and an optional helper note below.
// `icon` is optional and additive (every existing call site renders
// byte-identical without it) — a soft-blue chip in the eyebrow row, for
// pages that want the AODP-style "icon KPI" treatment locally.
export function StatCard({
  eyebrow,
  value,
  note,
  icon,
  className = "",
}: {
  eyebrow: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-2">
        <CardEyebrow>{eyebrow}</CardEyebrow>
        {icon ? (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
      {note ? <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{note}</div> : null}
    </Card>
  );
}
