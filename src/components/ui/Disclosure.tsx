"use client";

import { useId, useState } from "react";

// Shared domain-grouped accordion for long forms/detail pages. A real
// <button> trigger (not a styled <div>) gives aria-expanded/aria-controls
// and keyboard activation for free; content is hidden via the `hidden`
// attribute rather than unmounted, so collapsing a section never drops
// values a user already entered into it.
export function Disclosure({
  title,
  openTitle,
  icon,
  emphasized = false,
  defaultOpen = false,
  forceOpen = false,
  summary,
  hasError = false,
  errorLabel = "Perlu diperiksa",
  children,
  className = "",
}: {
  title: string;
  /** Label shown while expanded, e.g. "Tutup Form Client" instead of "Tambah Client". Defaults to `title`. */
  openTitle?: string;
  /** Leading icon rendered before the title (e.g. a plus glyph for "add" triggers). */
  icon?: React.ReactNode;
  /** Accent styling for triggers that start an action (add-new panels) vs plain view sections. */
  emphasized?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  summary?: string;
  hasError?: boolean;
  errorLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const contentId = useId();
  const [open, setOpen] = useState(defaultOpen || forceOpen);

  // Render-phase state sync (same pattern as useCloseEditOnSuccess, not
  // useEffect — react-hooks flags setState-in-effect) — a section that
  // gains a validation error must expand on the same render, not one paint
  // later.
  const [lastForceOpen, setLastForceOpen] = useState(forceOpen);
  if (forceOpen !== lastForceOpen) {
    setLastForceOpen(forceOpen);
    if (forceOpen) {
      setOpen(true);
    }
  }

  return (
    <div
      className={`rounded-lg border ${emphasized ? "border-brand-navy/30 dark:border-brand-navy/50" : "border-neutral-200 dark:border-neutral-800"} ${className}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
          emphasized ? "hover:bg-brand-navy/[0.04] dark:hover:bg-brand-navy/[0.08]" : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
        }`}
      >
        <span className="flex flex-wrap items-center gap-2">
          {icon ? (
            <span className={emphasized ? "text-brand-navy dark:text-brand-gold" : "text-neutral-500"} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span className="text-sm font-medium">{open && openTitle ? openTitle : title}</span>
          {summary ? <span className="text-xs text-neutral-500">{summary}</span> : null}
          {hasError ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {errorLabel}
            </span>
          ) : null}
        </span>
        <ChevronIcon open={open} />
      </button>
      <div id={contentId} hidden={!open} className="flex flex-col gap-3 px-4 pb-4">
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
