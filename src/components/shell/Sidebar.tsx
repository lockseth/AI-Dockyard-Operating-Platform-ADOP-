"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "./nav";
import type { PrimaryIdentity } from "@/lib/shell/identity";
import { branding } from "@/lib/branding";

const COLLAPSE_STORAGE_KEY = "adop-sidebar-collapsed";

function SidebarContent({
  identity,
  navGroups,
  userLabel,
  roleLabel,
  collapsed,
  logoutAction,
  onNavigate,
}: {
  identity: PrimaryIdentity;
  navGroups: NavGroup[];
  userLabel: string;
  roleLabel: string;
  collapsed: boolean;
  logoutAction: () => Promise<void>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-3 px-2">
        {identity.logoPath ? (
          <Image
            src={identity.logoPath}
            alt={identity.legalName}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-900 text-xs font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {identity.legalName.charAt(0)}
          </span>
        )}
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{identity.legalName}</p>
            <p className="truncate text-xs text-neutral-500">
              {branding.productName} {branding.brandedBy}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        {navGroups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            {!collapsed ? (
              <p className="px-2 text-xs font-medium tracking-widest text-neutral-400">{group.title}</p>
            ) : null}
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`rounded-md px-2 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 ${
                    isActive
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
                  }`}
                >
                  {collapsed ? item.label.charAt(0) : item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        {!collapsed ? (
          <div className="px-2 text-xs">
            <p className="truncate font-medium">{userLabel}</p>
            <p className="truncate text-neutral-500">{roleLabel}</p>
          </div>
        ) : null}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-md px-2 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
          >
            {collapsed ? "⏻" : "Keluar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({
  identity,
  navGroups,
  userLabel,
  roleLabel,
  logoutAction,
}: {
  identity: PrimaryIdentity;
  navGroups: NavGroup[];
  userLabel: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      {/* Mobile header bar with drawer trigger */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 md:hidden dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {identity.logoPath ? (
            <Image src={identity.logoPath} alt={identity.legalName} width={24} height={24} className="h-6 w-6 rounded object-contain" />
          ) : null}
          <span className="text-sm font-semibold">{identity.legalName}</span>
        </div>
        <button
          type="button"
          aria-label="Buka menu navigasi"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-900"
        >
          <span aria-hidden>☰</span>
        </button>
      </div>

      {/* Desktop persistent sidebar */}
      <aside
        className={`sticky top-0 relative hidden h-screen shrink-0 border-r border-neutral-200 transition-[width] duration-150 md:block dark:border-neutral-800 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent
          identity={identity}
          navGroups={navGroups}
          userLabel={userLabel}
          roleLabel={roleLabel}
          collapsed={collapsed}
          logoutAction={logoutAction}
        />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Perluas sidebar" : "Perkecil sidebar"}
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs text-neutral-500 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {collapsed ? "»" : "«"}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigasi">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative flex h-full w-72 max-w-[80vw] flex-col bg-white shadow-xl dark:bg-neutral-950">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                aria-label="Tutup menu navigasi"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-900"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>
            <SidebarContent
              identity={identity}
              navGroups={navGroups}
              userLabel={userLabel}
              roleLabel={roleLabel}
              collapsed={false}
              logoutAction={logoutAction}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
