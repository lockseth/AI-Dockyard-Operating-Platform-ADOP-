"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "./nav";
import type { PrimaryIdentity } from "@/lib/shell/identity";
import { branding } from "@/lib/branding";
import { NAV_ICON_BY_HREF } from "./nav-icons";

const COLLAPSE_STORAGE_KEY = "adop-sidebar-collapsed";
const OWNER_GROUP_TITLE = "OWNER";

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

  // Pick the single longest matching path (exact or prefix) across all items
  // so a parent route like "/app" never lights up alongside a more specific
  // sibling route like "/app/vessel-projects". Items whose destination href
  // covers only part of a wider section (e.g. Master Data's tabs) set
  // matchPrefix so the whole section stays highlighted.
  const activeMatch = navGroups
    .flatMap((group) => group.items)
    .map((item) => item.matchPrefix ?? item.href)
    .filter((match) => pathname === match || pathname.startsWith(`${match}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-5">
        {identity.logoPath ? (
          <Image
            src={identity.logoPath}
            alt={identity.legalName}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-md object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs font-semibold"
          >
            {identity.legalName.charAt(0)}
          </span>
        )}
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[13px] leading-snug font-bold break-words">{identity.legalName}</p>
            <p className="truncate text-[11px] font-medium text-white/50">
              {branding.productName} {branding.brandedBy}
            </p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-5">
        {navGroups.map((group) => {
          const isOwnerGroup = group.title === OWNER_GROUP_TITLE;
          return (
            <div key={group.title} className="flex flex-col gap-1">
              {!collapsed ? (
                <p className="px-2 text-[10.5px] font-bold tracking-widest text-white/40 uppercase">{group.title}</p>
              ) : (
                <div className="mx-3.5 mb-1 h-px bg-white/10" aria-hidden />
              )}
              {group.items.map((item) => {
                const isActive = (item.matchPrefix ?? item.href) === activeMatch;
                const Icon = NAV_ICON_BY_HREF[item.href];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-md border-l-[3px] py-2.5 text-[14.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      collapsed ? "justify-center px-2" : "pr-2 pl-[11px]"
                    } ${
                      isOwnerGroup
                        ? isActive
                          ? "border-brand-gold bg-brand-gold/20 font-semibold text-white shadow-sm"
                          : "border-transparent font-medium text-brand-gold/85 hover:bg-brand-gold/10 hover:text-white"
                        : isActive
                          ? "border-adop-accent bg-adop-accent/30 font-semibold text-white shadow-sm"
                          : "border-transparent font-medium text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {Icon ? (
                      <span
                        className={`shrink-0 ${
                          isOwnerGroup
                            ? isActive
                              ? "text-brand-gold"
                              : "text-brand-gold/85"
                            : isActive
                              ? "text-adop-accent-cyan"
                              : "text-white/50"
                        }`}
                      >
                        <Icon />
                      </span>
                    ) : collapsed ? (
                      <span aria-hidden>{item.label.charAt(0)}</span>
                    ) : null}
                    {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
        {!collapsed ? (
          <div className="px-2 text-xs">
            <p className="truncate font-medium text-white/90">{userLabel}</p>
            <p className="truncate text-white/50">{roleLabel}</p>
          </div>
        ) : null}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-md px-2 py-2 text-left text-sm text-white/60 hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {collapsed ? "⏻" : "Keluar"}
          </button>
        </form>
        {!collapsed ? <p className="px-2 text-[11px] text-white/40">{branding.poweredByLabel}</p> : null}
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
      <div className="flex items-center justify-between border-b border-neutral-200 bg-brand-navy px-4 py-3 md:hidden dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {identity.logoPath ? (
            <Image src={identity.logoPath} alt={identity.legalName} width={24} height={24} className="h-6 w-6 rounded object-contain" />
          ) : null}
          <span className="text-sm font-semibold text-white">{identity.legalName}</span>
        </div>
        <button
          type="button"
          aria-label="Buka menu navigasi"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-white/70 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span aria-hidden>☰</span>
        </button>
      </div>

      {/* Desktop persistent sidebar */}
      <aside
        className={`sticky top-0 relative hidden h-screen shrink-0 bg-brand-navy border-r border-white/10 transition-[width] duration-150 md:block ${
          collapsed ? "w-[76px]" : "w-[272px]"
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
          className="absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-brand-navy text-xs text-white/70 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
          <div className="relative flex h-full w-[272px] max-w-[80vw] flex-col bg-brand-navy shadow-brand-lg">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                aria-label="Tutup menu navigasi"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-white/70 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
