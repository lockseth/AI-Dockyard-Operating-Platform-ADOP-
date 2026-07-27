"use client";

import { Disclosure } from "@/components/ui/Disclosure";

// "Tambah X" becomes "Tutup Form X" once expanded, so the same control
// explains both what it does when closed and how to back out once open.
function closeLabel(label: string): string {
  const entity = label.replace(/^Tambah\s+/i, "");
  return entity === label ? `Tutup ${label}` : `Tutup Form ${entity}`;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" />
    </svg>
  );
}

export function CollapsibleCreatePanel({
  label,
  defaultOpen = false,
  forceOpen = false,
  hasError = false,
  errorLabel,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  hasError?: boolean;
  errorLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Disclosure
      title={label}
      openTitle={closeLabel(label)}
      icon={<PlusIcon />}
      emphasized
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      hasError={hasError}
      errorLabel={errorLabel}
    >
      {children}
    </Disclosure>
  );
}
