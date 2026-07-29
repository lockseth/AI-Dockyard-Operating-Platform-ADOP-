import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: admin-repository.ts is the ONLY file in this module
// allowed to use the service-role admin client (auth.admin.inviteUserByEmail
// has no non-admin equivalent). Every other file must stay on the ordinary
// per-request server client so its writes remain subject to the owner-only,
// self-target-excluded RLS policies added in
// 20260722030000_user_management.sql — routing them through service-role
// instead would silently bypass that DB-level enforcement.
const NON_ADMIN_SOURCE_FILES = [
  "types.ts",
  "validation.ts",
  "repository.ts",
  "errors.ts",
  "access.ts",
  "labels.ts",
  "service.ts",
  "actions.ts",
  "temporary-password.ts",
];

describe("user-management: admin client usage confined to admin-repository.ts", () => {
  it("admin-repository.ts references createSupabaseAdminClient", () => {
    const source = readFileSync(path.resolve(__dirname, "admin-repository.ts"), "utf8");
    expect(source).toMatch(/createSupabaseAdminClient/);
  });

  for (const file of NON_ADMIN_SOURCE_FILES) {
    it(`${file} does not reference createSupabaseAdminClient, lib/supabase/admin, or SUPABASE_SERVICE_ROLE_KEY`, () => {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/supabase\/admin/);
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });
  }
});
