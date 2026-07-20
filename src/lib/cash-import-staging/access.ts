import type { TenantRole } from "@/lib/auth/tenant";

// Distinct from src/lib/cash-import/access.ts's canAccessCashImport (the
// Gate 1J-A dry-run-only, admin-only gate) — this gate additionally lets
// owner read staged batches read-only. Admin still does all writes (create/
// map/disposition/ready-for-review).
const CASH_IMPORT_STAGING_WRITE_ROLES: TenantRole[] = ["admin"];
const CASH_IMPORT_STAGING_READ_ROLES: TenantRole[] = ["admin", "owner"];

export function canWriteCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_WRITE_ROLES.includes(role));
}

export function canReadCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_READ_ROLES.includes(role));
}
