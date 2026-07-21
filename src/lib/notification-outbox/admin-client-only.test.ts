import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard, mirrored from src/lib/cash-import-staging/no-service-role-
// exposure.test.ts but inverted: repository.ts is the ONE place in this
// codebase allowed to use the service-role admin client — the claim/
// complete/fail RPCs are granted to service_role only (see the migration),
// so there is no signed-in-user session for n8n's calls to run as. It must
// never fall back to the regular per-request server client, which would
// either fail outright (no session) or, worse, silently start depending on
// a Server Action/page request context this module is never called from.
describe("notification-outbox repository only ever uses the service-role admin client", () => {
  it("repository.ts references createSupabaseAdminClient, never createSupabaseServerClient", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    expect(source).toMatch(/createSupabaseAdminClient/);
    expect(source).not.toMatch(/createSupabaseServerClient/);
  });

  it("service.ts and the validation/secret layers never import the admin client directly", () => {
    for (const file of ["service.ts", "validation.ts", "secret.ts", "internal-auth.ts"]) {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/createSupabaseAdminClient/);
    }
  });
});
