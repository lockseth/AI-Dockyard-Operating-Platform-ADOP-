import type { TenantRole } from "@/lib/auth/tenant";

// Admin and owner both run daily operations; reviewer/viewer get a
// read-only access-denied panel instead of the workflow (server-side
// authorization — never trust a client-held role).
const DAILY_OPERATIONS_ROLES: TenantRole[] = ["owner", "admin"];

export function canAccessDailyOperations(roles: TenantRole[]): boolean {
  return roles.some((role) => DAILY_OPERATIONS_ROLES.includes(role));
}
