"use client";

import { Disclosure } from "@/components/ui/Disclosure";

export function CollapsibleCreatePanel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Disclosure title={label} defaultOpen={false}>
      {children}
    </Disclosure>
  );
}
