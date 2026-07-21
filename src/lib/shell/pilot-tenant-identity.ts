// Typed, server-owned deployment configuration for this pilot's public
// /login page identity — a single fixed value baked into the deployed
// build, not a per-request tenant lookup, not exposed as an API, and never
// derived from user input. It therefore carries none of the tenant-
// enumeration or pre-auth data-leak risk a dynamic "resolve tenant from a
// login-time hint" mechanism would (there is no such mechanism, and this
// file is not one — see the Gate 2 login-branding audit for why a dynamic
// resolver was rejected). A future multi-tenant deployment ships a
// different build of this file per deployment; it does not query the
// database. The authenticated sidebar's tenant identity
// (@/lib/shell/identity.ts's resolvePrimaryIdentity, sourced from the real
// legal_entities row) is the separate, DB-backed source of truth once a
// user has signed in and stays untouched by this file.
export interface PilotTenantLoginIdentity {
  legalName: string;
  logoPath: string;
}

export const pilotTenantLoginIdentity: PilotTenantLoginIdentity = {
  legalName: "PT PELAYARAN GEMA BAHARI",
  logoPath: "/branding/pt-pelayaran-gema-bahari-logo.png",
};
