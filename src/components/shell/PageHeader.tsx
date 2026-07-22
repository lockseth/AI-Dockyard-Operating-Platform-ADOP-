import Image from "next/image";
import type { PrimaryIdentity } from "@/lib/shell/identity";

function initialsFrom(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function PageHeader({
  title,
  sectionLabel,
  operationalDateLabel,
  identity,
  userLabel,
  roleLabel,
  showMobileTitle = true,
}: {
  title: string;
  sectionLabel?: string;
  operationalDateLabel?: string;
  identity?: PrimaryIdentity;
  userLabel?: string;
  roleLabel?: string;
  // Pages that render their own always-visible title block (heading +
  // subtitle + date, e.g. the Dashboard) set this false so PageHeader's
  // mobile-only fallback title doesn't duplicate it.
  showMobileTitle?: boolean;
}) {
  return (
    <header className="flex min-h-[44px] items-center gap-4 overflow-hidden border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
      <div className="hidden min-w-0 items-center gap-1.5 text-[13.5px] font-medium whitespace-nowrap text-adop-ink-600 sm:flex dark:text-neutral-400">
        <span>Beranda</span>
        {sectionLabel && sectionLabel !== title ? (
          <>
            <ChevronRight />
            <span className="truncate">{sectionLabel}</span>
          </>
        ) : null}
        <ChevronRight />
        <span className="truncate font-bold text-adop-accent-800 dark:text-blue-300">{title}</span>
      </div>

      {showMobileTitle ? (
        <div className="min-w-0 sm:hidden">
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          {operationalDateLabel ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{operationalDateLabel}</p>
          ) : null}
        </div>
      ) : null}

      <div className="min-w-2 flex-1" />

      {identity ? (
        <div
          className="hidden max-w-[300px] items-center gap-2.5 rounded-md px-2 py-1 lg:flex"
          title={identity.legalName}
        >
          {identity.logoPath ? (
            <Image
              src={identity.logoPath}
              alt={identity.legalName}
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-md border border-neutral-200 object-contain dark:border-neutral-700"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-100 text-xs font-bold text-adop-accent-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-blue-300">
              {initialsFrom(identity.legalName)}
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="line-clamp-2 text-[13px] leading-snug font-bold break-words">{identity.legalName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-adop-accent-800 dark:text-blue-300">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-adop-accent" />
              Perusahaan aktif
            </p>
          </div>
          <span aria-hidden className="shrink-0 text-adop-ink-500">
            <ChevronDown />
          </span>
        </div>
      ) : null}

      {identity ? <div aria-hidden className="hidden h-[30px] w-px shrink-0 bg-neutral-200 lg:block dark:bg-neutral-800" /> : null}

      <span
        aria-hidden
        title="Notifikasi belum tersedia"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 dark:text-neutral-500"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.5c-3 0-5 2.2-5 5.2v3.1c0 1-.4 1.9-1.2 2.6l-.6.6c-.6.5-.2 1.5.5 1.5h12.6c.7 0 1.1-1 .5-1.5l-.6-.6a3.6 3.6 0 0 1-1.2-2.6V8.7c0-3-2-5.2-5-5.2Z"
            fill="currentColor"
            opacity="0.14"
          />
          <path
            d="M12 3.5c-3 0-5 2.2-5 5.2v3.1c0 1-.4 1.9-1.2 2.6l-.6.6c-.6.5-.2 1.5.5 1.5h12.6c.7 0 1.1-1 .5-1.5l-.6-.6a3.6 3.6 0 0 1-1.2-2.6V8.7c0-3-2-5.2-5-5.2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9.7 19a2.3 2.3 0 0 0 4.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>

      {userLabel ? (
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[13px] font-bold text-adop-accent-cyan">
            {initialsFrom(userLabel)}
          </span>
          <div className="hidden min-w-0 max-w-[160px] leading-tight lg:block">
            <p className="truncate text-sm font-bold">{userLabel}</p>
            {roleLabel ? (
              <p className="truncate text-[11.5px] font-medium text-adop-ink-600 dark:text-neutral-400">{roleLabel}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function ChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
