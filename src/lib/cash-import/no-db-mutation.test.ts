import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Gate 1J-A regression guard: this module is a dry-run parser only. It must
// never touch Supabase (no client construction, no `.from()` table access,
// no service-role key) — the only auth-related call allowed is the
// tenant/role check that gates access to the preview itself.
const CASH_IMPORT_SOURCE_FILES = ["parser.ts", "actions.ts", "access.ts", "types.ts", "constants.ts"];

describe("cash-import module performs no database mutation and no service-role usage", () => {
  for (const file of CASH_IMPORT_SOURCE_FILES) {
    it(`${file} does not reference Supabase clients, tables, or the service-role key`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/supabase\/admin/);
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/createSupabaseServerClient/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      // Supabase's query builder starts a mutation with `.from("table")`,
      // distinct from Node/JS built-ins like `Buffer.from(...)` — require a
      // quote right after the paren so this doesn't false-positive on those.
      expect(source).not.toMatch(/\.from\(["']/);
      // No Supabase client is imported at all in this module (asserted
      // above), so `.insert/.update/.upsert/.delete` as query-builder calls
      // are structurally impossible here — not re-checked as a bare regex,
      // since that would false-positive on unrelated built-ins like
      // `crypto.createHash().update()`.
    });
  }
});
