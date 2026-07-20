import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the cash-import staging application path (repository,
// service, actions) must only ever query as the caller's own authenticated
// server client — never the service-role admin client, which bypasses RLS.
// Mirrors src/lib/auth/no-service-role-exposure.test.ts.
const SOURCE_FILES = ["repository.ts", "service.ts", "actions.ts"];

describe("cash-import-staging modules never reference the service-role admin client", () => {
  for (const file of SOURCE_FILES) {
    it(`${file} does not reference createSupabaseAdminClient or lib/supabase/admin`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/supabase\/admin/);
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });
  }
});
