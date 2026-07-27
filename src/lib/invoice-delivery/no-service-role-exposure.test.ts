import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the invoice-delivery application path must only ever
// query as the caller's own authenticated server client — never the
// service-role admin client, which bypasses RLS. Mirrors
// src/lib/invoice-evidence/no-service-role-exposure.test.ts.
const SOURCE_FILES = ["repository.ts", "service.ts", "actions.ts"];

describe("invoice-delivery modules never reference the service-role admin client", () => {
  for (const file of SOURCE_FILES) {
    it(`${file} does not reference createSupabaseAdminClient or lib/supabase/admin`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/supabase\/admin/);
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });
  }

  it("actions.ts never reads tenantId/actor/recorded_by from client FormData — only the ids/text fields the RPC expects", () => {
    const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");
    expect(source).not.toMatch(/formData\.get\(\s*["']tenantId["']/);
    expect(source).not.toMatch(/formData\.get\(\s*["']recordedBy["']/);
    expect(source).not.toMatch(/\.from\(/);
  });

  it("repository.ts scopes its direct table read by tenant_id (the RPC re-derives tenant server-side instead)", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    const directTableReadFunctions = source.split(/\nexport async function /).slice(1);
    const readFunctionsUsingFrom = directTableReadFunctions.filter((block) => block.includes('.from("invoice'));
    expect(readFunctionsUsingFrom.length).toBeGreaterThan(0);
    for (const block of readFunctionsUsingFrom) {
      expect(block).toMatch(/\.eq\("tenant_id"/);
    }
  });
});
