export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "destructive" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

// Shared button — six variants (primary/brand/secondary/ghost/destructive/
// icon), three sizes, all wired to the brand-navy/brand-gold chrome tokens
// in globals.css. `brand` is reserved for owner-tier actions (LOCK: Gold /
// Owner Action). `loading` only adds the spinner + forces disabled — text
// swap during a pending action stays the caller's responsibility (matches
// the existing `{isPending ? "..." : "..."}` pattern used across the app).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-adop-accent text-white hover:bg-adop-accent-600 active:bg-adop-accent-700 disabled:opacity-40",
  brand:
    "bg-brand-gold text-brand-navy font-bold hover:bg-brand-gold-hover active:bg-brand-gold-active disabled:opacity-40",
  secondary:
    "bg-white text-brand-navy border-[1.5px] border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-40 dark:bg-neutral-900 dark:text-white dark:border-neutral-700 dark:hover:bg-neutral-800",
  ghost:
    "bg-transparent text-adop-accent-800 hover:bg-adop-accent-50 active:bg-adop-accent-100 disabled:opacity-40 dark:text-blue-300 dark:hover:bg-blue-950/30",
  destructive:
    "bg-red-700 text-white hover:bg-red-800 active:bg-red-900 disabled:opacity-40",
  icon: "bg-adop-accent text-white hover:bg-adop-accent-600 active:bg-adop-accent-700 disabled:opacity-40",
};

const SIZE_CLASSES: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: {
    sm: "h-8 px-3 rounded-[7px] text-[12.5px] gap-1.5",
    md: "h-10 px-[18px] rounded-lg text-sm gap-2",
    lg: "h-12 px-6 rounded-[9px] text-[15px] gap-2",
  },
  brand: {
    sm: "h-8 px-3 rounded-[7px] text-[12.5px] gap-1.5",
    md: "h-10 px-[18px] rounded-lg text-sm gap-2",
    lg: "h-12 px-6 rounded-[9px] text-[15px] gap-2",
  },
  secondary: {
    sm: "h-8 px-3 rounded-[7px] text-[12.5px] gap-1.5",
    md: "h-10 px-[18px] rounded-lg text-sm gap-2",
    lg: "h-12 px-6 rounded-[9px] text-[15px] gap-2",
  },
  ghost: {
    sm: "h-8 px-3 rounded-[7px] text-[12.5px] gap-1.5",
    md: "h-10 px-[18px] rounded-lg text-sm gap-2",
    lg: "h-12 px-6 rounded-[9px] text-[15px] gap-2",
  },
  destructive: {
    sm: "h-8 px-3 rounded-[7px] text-[12.5px] gap-1.5",
    md: "h-10 px-[18px] rounded-lg text-sm gap-2",
    lg: "h-12 px-6 rounded-[9px] text-[15px] gap-2",
  },
  icon: {
    sm: "h-8 w-8 rounded-[7px]",
    md: "h-10 w-10 rounded-lg",
    lg: "h-12 w-12 rounded-[9px]",
  },
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-adop-accent-600 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[variant][size]} ${className}`}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
