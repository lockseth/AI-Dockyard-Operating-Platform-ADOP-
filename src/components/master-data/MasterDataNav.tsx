"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MasterDataNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "border-brand-navy bg-brand-navy text-white dark:border-brand-gold dark:bg-brand-gold dark:text-brand-navy"
                : "border-neutral-200 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
