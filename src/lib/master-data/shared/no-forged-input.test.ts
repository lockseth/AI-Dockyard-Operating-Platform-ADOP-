import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard, same style as src/lib/auth/no-service-role-exposure.test.ts:
// every master-data domain must independently uphold the Gate 1A rules —
// tenant_id/created_by never taken from client input, no service-role use
// from the request-scoped path, and every mutation re-checks the tenant role
// server-side (defense in depth on top of RLS/column grants).
const DOMAIN_DIRS = [
  "clients",
  "client-contacts",
  "vessels",
  "vendors",
  "service-types",
  "facility-locations",
  "expense-categories",
];

function readDomainFile(domain: string, file: string): string {
  return readFileSync(path.resolve(__dirname, "..", domain, file), "utf8");
}

describe("master-data actions never read tenantId/createdBy from FormData", () => {
  for (const domain of DOMAIN_DIRS) {
    it(`${domain}/actions.ts does not call formData.get("tenantId") or formData.get("createdBy")`, () => {
      const source = readDomainFile(domain, "actions.ts");
      expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']\s*\)/);
      expect(source).not.toMatch(/formData\.get\(\s*["']createdBy["']\s*\)/);
    });
  }
});

describe("master-data validation parsers never read tenantId/createdBy from FormData", () => {
  for (const domain of DOMAIN_DIRS) {
    it(`${domain}/validation.ts does not call formData.get("tenantId") or formData.get("createdBy")`, () => {
      const source = readDomainFile(domain, "validation.ts");
      expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']\s*\)/);
      expect(source).not.toMatch(/formData\.get\(\s*["']createdBy["']\s*\)/);
    });
  }
});

describe("master-data service/repository files never use the service-role admin client", () => {
  for (const domain of DOMAIN_DIRS) {
    for (const file of ["service.ts", "repository.ts"]) {
      it(`${domain}/${file} does not reference createSupabaseAdminClient or lib/supabase/admin`, () => {
        const source = readDomainFile(domain, file);
        expect(source).not.toMatch(/supabase\/admin/);
        expect(source).not.toMatch(/createSupabaseAdminClient/);
        expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      });
    }
  }
});

describe("every master-data mutation re-checks the caller's tenant role server-side", () => {
  // create + update + setStatus per domain — the fixed shape every
  // domain's service.ts follows (see clients/service.ts as the template).
  const EXPECTED_MUTATIONS_PER_DOMAIN = 3;

  for (const domain of DOMAIN_DIRS) {
    it(`${domain}/service.ts calls requireTenantRole(context, ["owner", "admin"]) for every mutation`, () => {
      const source = readDomainFile(domain, "service.ts");
      const contextCalls = source.match(/requireTenantContext\(\)/g) ?? [];
      const roleGuardCalls = source.match(/requireTenantRole\(context, \["owner", "admin"\]\)/g) ?? [];

      expect(roleGuardCalls.length).toBe(EXPECTED_MUTATIONS_PER_DOMAIN);
      // Every requireTenantRole call is necessarily preceded by its own
      // requireTenantContext() call within the same function — read-only
      // list/get functions add one more requireTenantContext() with no
      // matching role guard, so context calls are always >= role guards.
      expect(contextCalls.length).toBeGreaterThanOrEqual(roleGuardCalls.length);
    });
  }
});
