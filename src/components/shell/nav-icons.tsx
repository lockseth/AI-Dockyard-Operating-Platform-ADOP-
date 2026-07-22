// One icon per built nav destination, ported from the approved prototype's
// icon set. Icons are purely decorative labeling for an already-labeled
// link, hence aria-hidden; sized to the sidebar's 20px icon slot.
function IconBase({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

function DashboardIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="13" r="8" fill="currentColor" opacity="0.18" />
      <path d="M6 17a6.5 6.5 0 0 1 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 13l3.2-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="13" r="1.4" fill="currentColor" />
    </IconBase>
  );
}

function DailyOpsIcon() {
  return (
    <IconBase>
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="currentColor" opacity="0.18" />
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 3v3M16.5 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.5 14l2 2 4-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function HistoryIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12.5" r="8" fill="currentColor" opacity="0.18" />
      <circle cx="12" cy="12.5" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v4.5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function VesselProjectIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="6" r="2.2" fill="currentColor" opacity="0.5" />
      <path d="M12 8v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 11h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 14a7 7 0 0 0 7 7 7 7 0 0 0 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </IconBase>
  );
}

function OverheadPoolIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="7.5" r="3.2" fill="currentColor" opacity="0.18" />
      <circle cx="12" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10.7v3.3M12 14l-4.5 4M12 14l4.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.5" cy="19" r="1.8" fill="currentColor" opacity="0.5" />
      <circle cx="17.5" cy="19" r="1.8" fill="currentColor" opacity="0.5" />
    </IconBase>
  );
}

function ReviewIcon() {
  return (
    <IconBase>
      <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" opacity="0.18" />
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12.5l2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function MasterDataIcon() {
  return (
    <IconBase>
      <ellipse cx="12" cy="6" rx="7" ry="3" fill="currentColor" opacity="0.18" />
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" stroke="currentColor" strokeWidth="1.5" />
    </IconBase>
  );
}

function ImportIcon() {
  return (
    <IconBase>
      <path d="M4 14h4l1.8 2.4h4.4L16 14h4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill="currentColor" opacity="0.18" />
      <path d="M4 14h4l1.8 2.4h4.4L16 14h4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 3v9m0 0l-3.2-3.4M12 12l3.2-3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </IconBase>
  );
}

function OwnerControlIcon() {
  return (
    <IconBase>
      <path d="M12 3l7 3v5.5c0 5-3 8.3-7 9.5-4-1.2-7-4.5-7-9.5V6Z" fill="currentColor" opacity="0.24" />
      <path d="M12 3l7 3v5.5c0 5-3 8.3-7 9.5-4-1.2-7-4.5-7-9.5V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M12 8.2l1.15 2.33 2.57.37-1.86 1.81.44 2.56L12 14.05l-2.3 1.24.44-2.56-1.86-1.81 2.57-.37Z"
        fill="currentColor"
      />
    </IconBase>
  );
}

// Keyed by NavItem.href (see components/shell/nav.ts) — every built
// destination gets an entry; anything not listed here falls back silently
// (Sidebar renders no icon rather than a mismatched placeholder).
export const NAV_ICON_BY_HREF: Record<string, () => React.ReactElement> = {
  "/app": DashboardIcon,
  "/operations/daily": DailyOpsIcon,
  "/operations/history": HistoryIcon,
  "/operations/overhead": OverheadPoolIcon,
  "/app/vessel-projects": VesselProjectIcon,
  "/app/reviews": ReviewIcon,
  "/app/master-data/clients": MasterDataIcon,
  "/operations/import": ImportIcon,
  "/owner/control": OwnerControlIcon,
};
