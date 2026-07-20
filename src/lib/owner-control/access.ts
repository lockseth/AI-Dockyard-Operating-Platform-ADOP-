import type { TenantRole } from "@/lib/auth/tenant";

// Owner Control is strictly owner-only — admin/reviewer/viewer all get the
// access-denied panel instead (server-side authorization — never trust a
// client-held role).
export function canAccessOwnerControl(roles: TenantRole[]): boolean {
  return roles.includes("owner");
}
