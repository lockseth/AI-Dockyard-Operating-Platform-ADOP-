import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard, mirrored from src/lib/notification-outbox/admin-client-
// only.test.ts: repository.ts is the ONE place in this module allowed to
// use the service-role admin client — every read it performs stands in for
// a session-bound *ForActiveTenant read that n8n's scheduled trigger has no
// session to make. It must never fall back to the regular per-request
// server client (no session exists to bind to), and every OTHER file in
// this module must stay pure/session-free so the business logic
// (read-model composition, message composition, orchestration) never
// silently grows its own RLS-bypassing read path.
const OTHER_FILES = ["read-model.ts", "composer.ts", "service.ts", "validation.ts"];

describe("morning-brief module only ever uses the service-role admin client in repository.ts", () => {
  it("repository.ts references createSupabaseAdminClient, never createSupabaseServerClient", () => {
    const source = readFileSync(path.resolve(__dirname, "repository.ts"), "utf8");
    expect(source).toMatch(/createSupabaseAdminClient/);
    expect(source).not.toMatch(/createSupabaseServerClient/);
  });

  it("every other file in this module never imports the admin client directly", () => {
    for (const file of OTHER_FILES) {
      const source = readFileSync(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/createSupabaseAdminClient/);
      expect(source).not.toMatch(/supabase\/admin/);
    }
  });
});
