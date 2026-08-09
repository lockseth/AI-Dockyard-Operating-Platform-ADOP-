import type { TenantRole } from "@/lib/auth/tenant";

// Owner Control is strictly owner-only — admin/reviewer/viewer all get the
// access-denied panel instead (server-side authorization — never trust a
// client-held role).
export function canAccessOwnerControl(roles: TenantRole[]): boolean {
  return roles.includes("owner");
}

// Single source of truth for where a post-auth redirect should land, reused
// by every entry point that resolves a membership and redirects (login,
// tenant switch, tenant/resolve bootstrap, forced password change) so an
// owner always lands on their one dashboard instead of the admin/operational
// one. Not a new authorization boundary — it wraps the same
// canAccessOwnerControl check /owner/control's own page already enforces
// server-side, only used here to pick a landing route, not to grant access.
export function resolvePostAuthDestination(roles: TenantRole[]): string {
  return canAccessOwnerControl(roles) ? "/owner/control" : "/app";
}
