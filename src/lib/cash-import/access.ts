import type { TenantRole } from "@/lib/auth/tenant";

// Gate 1J-A lock: owner does not perform import, and reviewer/viewer never
// touch source financial files — admin only. Server-side authorization
// (checked again inside the server action itself), never a client-hidden
// nav item.
const CASH_IMPORT_ROLES: TenantRole[] = ["admin"];

export function canAccessCashImport(roles: TenantRole[]): boolean {
  return roles.some((role) => CASH_IMPORT_ROLES.includes(role));
}
