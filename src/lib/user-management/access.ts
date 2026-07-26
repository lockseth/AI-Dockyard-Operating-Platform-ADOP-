import type { TenantRole } from "@/lib/auth/tenant";

// Read access matches the existing tenant_memberships/membership_roles
// SELECT policy (Gate 0A): owner and admin can already see every membership
// in their tenant. This gate does not widen that — admin stays read-only
// here because no existing grant/policy gives admin any write capability on
// membership tables, and nothing in this task asks for a new one.
export function canViewUserManagement(roles: TenantRole[]): boolean {
  return roles.includes("owner") || roles.includes("admin");
}

export function canManageUserManagement(roles: TenantRole[]): boolean {
  return roles.includes("owner");
}
