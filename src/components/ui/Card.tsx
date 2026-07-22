const TONE_CLASSES = {
  default: "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950",
  // Reserved for owner-tier callouts (LOCK: Gold / Owner Action surface).
  owner: "border-[#e6cf94] bg-[#fdf9f0] dark:border-brand-gold/40 dark:bg-neutral-950",
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
export function StatCard({
  eyebrow,
  value,
  note,
  className = "",
}: {
  eyebrow: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardEyebrow>{eyebrow}</CardEyebrow>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
        {value}
      </div>
      {note ? <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{note}</div> : null}
    </Card>
  );
}
