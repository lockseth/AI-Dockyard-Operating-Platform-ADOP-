import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { canAccessOwnerControl } from "@/lib/owner-control/access";
import { canAccessOwnerWhatsappRegistration } from "@/lib/assistant-identity/access";
import { canReadCashImportStaging } from "@/lib/cash-import-staging/access";
import { canViewUserManagement } from "@/lib/user-management/access";
import { canAccessInvoiceEvidence } from "@/lib/invoice-evidence/access";
import { canAccessExecutiveReport } from "@/lib/executive-report/access";
import type { TenantRole } from "@/lib/auth/tenant";

export interface NavItem {
  href: string;
  label: string;
  // Set when the link's destination (href) is only one page within a wider
  // section (e.g. Master Data's tabs) — the sidebar highlights this item for
  // any path under matchPrefix, not just the exact href.
  matchPrefix?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Visibility here only hides/shows a link — every destination re-checks
// authorization server-side on its own page (requireTenantContext +
// canAccess*/AccessDenied). Hiding a link is never the authorization
// boundary, per LOCK rule B.5.
export function getNavGroupsForRoles(roles: TenantRole[]): NavGroup[] {
  // Owner Navigation Cleanup (follow-up to Gate 3B/9A) — an owner's sidebar
  // is intentionally a short, curated list (Dashboard Owner, Laporan
  // Eksekutif, User & Hak Akses) rather than the full operational nav below.
  // This is presentation-only: every route this hides (/operations/daily,
  // /app/vessel-projects, /app/master-data/*, /billing/*, etc.) stays live
  // and reachable by direct link/drill-down from Owner Control — see
  // canAccessOwnerControl's own callers for the actual authorization gate.
  // Non-owner roles (admin/reviewer/viewer) are unaffected and keep seeing
  // the exact nav they always have.
  if (canAccessOwnerControl(roles)) {
    return getOwnerNavGroups(roles);
  }
  return getOperationalNavGroups(roles);
}

function getOwnerNavGroups(roles: TenantRole[]): NavGroup[] {
  const groups: NavGroup[] = [
    { title: "RINGKASAN", items: [{ href: "/owner/control", label: "Dashboard Owner" }] },
  ];

  if (canAccessExecutiveReport(roles)) {
    groups.push({ title: "OWNER", items: [{ href: "/app/executive-report", label: "Laporan Eksekutif" }] });
  }

  // Single PENGATURAN group — items append onto the SAME group rather than
  // each pushing their own group, so adding a new settings destination
  // (Gate 1L-R4A) never renders a second "PENGATURAN" header in the
  // sidebar (task LOCK: "bukan menu utama baru").
  const pengaturanItems: NavItem[] = [];
  if (canAccessOwnerWhatsappRegistration(roles)) {
    pengaturanItems.push({ href: "/app/settings/personal", label: "Profil & Notifikasi WhatsApp" });
  }
  if (canViewUserManagement(roles)) {
    pengaturanItems.push({ href: "/app/users", label: "User & Hak Akses" });
  }
  if (pengaturanItems.length > 0) {
    groups.push({ title: "PENGATURAN", items: pengaturanItems });
  }

  return groups;
}

function getOperationalNavGroups(roles: TenantRole[]): NavGroup[] {
  const groups: NavGroup[] = [{ title: "RINGKASAN", items: [{ href: "/app", label: "Dashboard" }] }];

  const operasionalItems: NavItem[] = [];
  if (canAccessDailyOperations(roles)) {
    operasionalItems.push({ href: "/operations/daily", label: "Operasional Harian" });
    operasionalItems.push({ href: "/operations/history", label: "Riwayat Transaksi" });
    operasionalItems.push({ href: "/operations/overhead", label: "Biaya Bersama/Overhead" });
  }
  operasionalItems.push({ href: "/app/vessel-projects", label: "Project Kapal" });
  operasionalItems.push({ href: "/app/reviews", label: "Review & Approval" });
  groups.push({ title: "OPERASIONAL", items: operasionalItems });

  const dataItems: NavItem[] = [
    { href: "/app/master-data/clients", label: "Master Data", matchPrefix: "/app/master-data" },
  ];
  if (canReadCashImportStaging(roles)) {
    dataItems.push({ href: "/operations/import", label: "Import Data" });
  }
  groups.push({ title: "MANAJEMEN DATA", items: dataItems });

  if (canAccessInvoiceEvidence(roles)) {
    groups.push({
      title: "BILLING",
      items: [
        { href: "/billing/workspace", label: "Ringkasan Billing" },
        { href: "/billing/invoices", label: "Invoice & Evidence" },
      ],
    });
  }

  const ownerItems: NavItem[] = [];
  if (canAccessExecutiveReport(roles)) {
    ownerItems.push({ href: "/app/executive-report", label: "Laporan Eksekutif" });
  }
  if (ownerItems.length > 0) {
    groups.push({ title: "OWNER", items: ownerItems });
  }

  if (canViewUserManagement(roles)) {
    groups.push({ title: "AKSES", items: [{ href: "/app/users", label: "User & Hak Akses" }] });
  }

  return groups;
}
