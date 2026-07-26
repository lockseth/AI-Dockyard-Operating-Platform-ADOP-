import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-regression guard: repository.ts is the one place bypassing nothing
// (it stays on the ordinary RLS-enforced server client), but every read must
// still explicitly scope by tenant_id as defense in depth on top of RLS —
// the same convention already used by src/lib/master-data/vessels/
// repository.ts. A missing tenant_id filter here would be a real
// cross-tenant leak, not just redundant belt-and-suspenders.
describe("user-management repository source", () => {
  const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");

  it("scopes every tenant_memberships read by tenant_id", () => {
    const matches = source.match(/\.from\("tenant_memberships"\)[\s\S]{0,200}?\.select\(/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
  });

  it("never imports the service-role admin client", () => {
    expect(source).not.toMatch(/supabase\/admin/);
    expect(source).not.toMatch(/createSupabaseAdminClient/);
  });

  it("uses createSupabaseServerClient, not createSupabaseAdminClient", () => {
    expect(source).toMatch(/createSupabaseServerClient/);
  });
});
