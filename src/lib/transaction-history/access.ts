import type { TenantRole } from "@/lib/auth/tenant";

// Gate 1K task LOCK: "memungkinkan Owner dan Admin" — narrower than the
// underlying ledgers' own `_select_member` policy (which also admits
// viewer/reviewer); enforced again, independently, inside every
// SECURITY DEFINER function in 20260720140000_trusted_transaction_history.sql.
const TRUSTED_TRANSACTION_HISTORY_READ_ROLES: TenantRole[] = ["owner", "admin"];

export function canViewTrustedTransactionHistory(roles: TenantRole[]): boolean {
  return roles.some((role) => TRUSTED_TRANSACTION_HISTORY_READ_ROLES.includes(role));
}
