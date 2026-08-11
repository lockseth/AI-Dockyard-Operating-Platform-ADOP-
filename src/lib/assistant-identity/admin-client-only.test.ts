import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: admin-repository.ts is the ONLY file in this module
// allowed to use the service-role admin client. assistant_complete_pairing
// and assistant_complete_client_verification are the WhatsApp-reply side of
// the contract (no browser session), granted to service_role only — every
// other file must stay on the ordinary per-request server client so its
// writes remain subject to the RLS/role checks each RPC itself re-derives.
const NON_ADMIN_SOURCE_FILES = [
  "types.ts",
  "validation.ts",
  "masking.ts",
  "errors.ts",
  "repository.ts",
  "service.ts",
  "access.ts",
  "actions.ts",
];

describe("assistant-identity: admin client usage confined to admin-repository.ts", () => {
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
