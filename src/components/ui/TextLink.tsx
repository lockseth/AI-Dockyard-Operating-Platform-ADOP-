import Link, { type LinkProps } from "next/link";

const TONE_CLASSES = {
  neutral: "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
  brand: "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300",
  danger: "text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200",
} as const;

// Shared secondary-action link (row-level "Lihat Detail", panel "Buka
// Riwayat", etc.) so every such link gets the same visible focus ring —
// the plain underlined <Link>s scattered across list/detail pages had
// hover styling but no focus-visible treatment for keyboard users.
export function TextLink({
  tone = "neutral",
  className = "",
  children,
  ...props
}: {
  tone?: keyof typeof TONE_CLASSES;
  className?: string;
  children: React.ReactNode;
} & LinkProps) {
  return (
    <Link
      {...props}
      className={`rounded underline underline-offset-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}
