import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: repository.ts is the ONLY file in this module allowed
// to construct a Supabase client or reference the service-role key —
// everything else (target/identity/validation/plan/journal/audit/redact/
// executor/types) must stay pure and network-free so it can be unit tested
// without mocks standing in for a real client. cli.ts is also allowed to
// reference the service-role key name because it is the one place reading
// it from the environment — but it never constructs a client directly, it
// only passes the key string into repository.createAdminClient().
const PURE_FILES = [
  "target.ts",
  "identity.ts",
  "validation.ts",
  "plan.ts",
  "journal.ts",
  "audit.ts",
  "redact.ts",
  "executor.ts",
  "types.ts",
  "cli-args.ts",
];

describe("demo-owner-bootstrap: admin client usage confined to repository.ts", () => {
  it("repository.ts references createClient and the admin auth API", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    expect(source).toMatch(/createClient/);
    expect(source).toMatch(/auth\.admin/);
  });

  it("repository.ts never issues a delete/truncate/reset operation", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\btruncate\s*\(/i);
    expect(source).not.toMatch(/deleteUser/);
  });

  for (const file of PURE_FILES) {
    it(`${file} does not construct a Supabase client or reference the service-role key`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/createClient/);
      expect(source).not.toMatch(/@supabase\/supabase-js/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(source).not.toMatch(/auth\.admin/);
    });
  }

  it("cli.ts never constructs a client directly (only via repository.createAdminClient)", () => {
    const source = readFileSync(path.resolve(__dirname, "cli.ts"), "utf8");
    expect(source).not.toMatch(/createClient\(/);
    expect(source).toMatch(/createAdminClient/);
  });
});
