import type { TenantRole } from "@/lib/auth/tenant";

// Gate 1L-R4A: self-service Owner WhatsApp recipient registration —
// deliberately narrower than assistant_issue_pairing_challenge's own RPC
// authorization (owner OR admin, Gate 6J-B foundation). This gate's scope is
// "Owner yang sudah login" only (task LOCK); an Admin channel-identity flow
// is a distinct, not-yet-built persona per the frozen 6J-A contract §9.2,
// not widened here. Mirrors owner-control/access.ts's exact shape.
export function canAccessOwnerWhatsappRegistration(roles: TenantRole[]): boolean {
  return roles.includes("owner");
}
