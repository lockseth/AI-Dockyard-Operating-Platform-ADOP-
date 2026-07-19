import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the tenant-aware auth path (login, tenant resolution,
// role checks) must only ever query as the caller's own authenticated
// client — never the service-role admin client, which bypasses RLS.
// admin.ts stays reserved for trusted server-only workflows (e.g. test
// fixtures), never the user-facing auth/tenant-context path.
const AUTH_SOURCE_FILES = [
  "session.ts",
  "tenant.ts",
  "actions.ts",
  "cookies.ts",
  "validation.ts",
];

describe("auth/tenant modules never import the service-role admin client", () => {
  for (const file of AUTH_SOURCE_FILES) {
    it(`${file} does not reference createSupabaseAdminClient or lib/supabase/admin`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/supabase\/admin/);
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });
  }
});
