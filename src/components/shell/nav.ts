import { canAccessDailyOperations } from "@/lib/operations-daily/access";
import { canAccessOwnerControl } from "@/lib/owner-control/access";
import { canReadCashImportStaging } from "@/lib/cash-import-staging/access";
import { canViewUserManagement } from "@/lib/user-management/access";
import { canAccessInvoiceEvidence } from "@/lib/invoice-evidence/access";
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
  const groups: NavGroup[] = [
    {
      title: "RINGKASAN",
      items: [{ href: "/app", label: "Dashboard" }],
    },
  ];

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
    groups.push({ title: "BILLING", items: [{ href: "/billing/invoices", label: "Invoice & Evidence" }] });
  }

  if (canAccessOwnerControl(roles)) {
    groups.push({ title: "OWNER", items: [{ href: "/owner/control", label: "Owner Control" }] });
  }

  if (canViewUserManagement(roles)) {
    groups.push({ title: "AKSES", items: [{ href: "/app/users", label: "User & Hak Akses" }] });
  }

  return groups;
}
