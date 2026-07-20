import type { TenantRole } from "@/lib/auth/tenant";

// Distinct from src/lib/cash-import/access.ts's canAccessCashImport (the
// Gate 1J-A dry-run-only, admin-only gate) — this gate additionally lets
// owner read staged batches read-only. Admin still does all writes (create/
// map/disposition/ready-for-review).
const CASH_IMPORT_STAGING_WRITE_ROLES: TenantRole[] = ["admin"];
const CASH_IMPORT_STAGING_READ_ROLES: TenantRole[] = ["admin", "owner"];
// Gate 1J-C: only the owner may approve/commit or reject a ready_for_review
// batch — admin does every step up to ready_for_review, never the canonical
// commit itself (task LOCK: "Admin tidak boleh approve/commit").
const CASH_IMPORT_STAGING_APPROVE_ROLES: TenantRole[] = ["owner"];
// Gate 1J-D: only the owner may roll back a committed batch — admin (and
// every other role) sees the rolled-back result read-only, same posture as
// approve/reject (task LOCK: "Hanya owner tenant yang sama").
const CASH_IMPORT_STAGING_ROLLBACK_ROLES: TenantRole[] = ["owner"];

export function canWriteCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_WRITE_ROLES.includes(role));
}

export function canReadCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_READ_ROLES.includes(role));
}

export function canApproveCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_APPROVE_ROLES.includes(role));
}

export function canRollbackCashImportStaging(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_STAGING_ROLLBACK_ROLES.includes(role));
}
