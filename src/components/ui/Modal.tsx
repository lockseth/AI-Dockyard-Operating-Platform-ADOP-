"use client";

import { useEffect } from "react";

// Shared modal shell — backdrop, Escape-to-close, header/body/footer slots.
// Not yet consumed by any page: operations-daily's confirmations are an
// intentional two-step inline-review pattern (see CashEntryForm's
// OpeningCashEntryForm) and window.confirm() elsewhere, both out of this
// redesign's scope — this is a ready-for-reuse shared primitive per the
// design system's Modal spec, for the next flow that needs a real dialog.
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = size === "sm" ? "max-w-[420px]" : size === "lg" ? "max-w-[640px]" : "max-w-[480px]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    >
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div className={`relative flex w-full ${widthClass} flex-col rounded-xl bg-white shadow-brand-lg dark:bg-neutral-950`}>
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <h2 className="text-[15px] font-bold text-neutral-900 dark:text-neutral-50">{title}</h2>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-neutral-900"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-neutral-600 dark:text-neutral-300">
          {children}
        </div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-neutral-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
