import type { DemoTenantIdentity } from "./types";

// Locked demo tenant identity (Gate 6G-B target lock). The first account
// provisioned by this harness is an internal Founder owner — never the
// design partner's real owner — so no real person's name is fixed here.
export const DEMO_TENANT_IDENTITY: DemoTenantIdentity = {
  slug: "pt-pelayaran-gema-bahari-demo",
  displayName: "PT PELAYARAN GEMA BAHARI",
  legalName: "PT PELAYARAN GEMA BAHARI",
  legalDisplayName: "PT PELAYARAN GEMA BAHARI",
};

// The bootstrapped account is an internal Founder owner, never the design
// partner's real owner — this literal must never appear in an identity
// provisioned by this harness (CLAUDE.md §4, Gate 6G-B lock).
const FORBIDDEN_OWNER_NAME_FRAGMENTS = ["hanafi"];

export function containsForbiddenOwnerLiteral(value: string): boolean {
  const lower = value.toLowerCase();
  return FORBIDDEN_OWNER_NAME_FRAGMENTS.some((fragment) => lower.includes(fragment));
}
