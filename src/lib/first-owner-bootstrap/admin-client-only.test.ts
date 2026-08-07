import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: issuance-repository.ts and claim-repository.ts are the
// ONLY files in this module allowed to construct a Supabase client or
// reference the service-role key — mirrors demo-owner-bootstrap's own
// admin-client-only.test.ts for the same reason: everything else stays
// pure/network-free so it can be unit tested without mocks.
const PURE_FILES = [
  "token.ts",
  "types.ts",
  "validation.ts",
  "issuance.ts",
  "issuance-runner.ts",
  "cli-args.ts",
];

describe("first-owner-bootstrap: admin client usage confined to *-repository.ts", () => {
  it("issuance-repository.ts references createClient", () => {
    // No auth.admin call here on purpose — issuance never creates an
    // auth.users row (that only happens at claim time, in
    // claim-repository.ts, once Pak Hanafi chooses his own password).
    const source = readFileSync(path.resolve(__dirname, "issuance-repository.ts"), "utf8");
    expect(source).toMatch(/createClient/);
  });

  it("claim-repository.ts uses the shared server-only admin client and the admin auth API", () => {
    const source = readFileSync(path.resolve(__dirname, "claim-repository.ts"), "utf8");
    expect(source).toMatch(/createSupabaseAdminClient/);
    expect(source).toMatch(/auth\.admin/);
  });

  for (const file of ["issuance-repository.ts", "claim-repository.ts"]) {
    it(`${file} never issues a delete/truncate operation`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/\.delete\(/);
      expect(source).not.toMatch(/\btruncate\s*\(/i);
      expect(source).not.toMatch(/deleteUser/);
    });
  }

  for (const file of PURE_FILES) {
    it(`${file} does not construct a Supabase client or reference the service-role key`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/createClient/);
      expect(source).not.toMatch(/@supabase\/supabase-js/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(source).not.toMatch(/auth\.admin/);
    });
  }

  it("cli.ts never constructs a client directly (only via issuance-repository.createAdminClient)", () => {
    const source = readFileSync(path.resolve(__dirname, "cli.ts"), "utf8");
    expect(source).not.toMatch(/createClient\(/);
    expect(source).toMatch(/createAdminClient/);
  });
});
