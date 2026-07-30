import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard, mirrored from src/lib/notification-outbox/admin-client-
// only.test.ts: repository.ts is the ONE file in this directory allowed to
// reference the service-role admin client. handler.ts calls into
// @/lib/assistant-identity/admin-repository for the PAIR completion RPC
// instead of instantiating a second admin client for the same RPC — that
// import must not be mistaken for a local admin-client reference either.
describe("assistant-inbound admin client boundary", () => {
  it("repository.ts references createSupabaseAdminClient", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    expect(source).toMatch(/createSupabaseAdminClient/);
  });

  it("every other module file never imports createSupabaseAdminClient or @/lib/supabase/admin directly", () => {
    for (const file of [
      "types.ts",
      "validation.ts",
      "parser.ts",
      "signature.ts",
      "safe-replies.ts",
      "handler.ts",
      "derive-provider-message-id.ts",
    ]) {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/@\/lib\/supabase\/admin/);
    }
  });
});
