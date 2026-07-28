import path from "node:path";
import { defineConfig } from "vitest/config";

// Requires a running local Supabase stack (`pnpm supabase:start`). Run via
// `pnpm test:integration` — kept out of the default `pnpm test` suite since
// it needs Docker/network, not just source files.
//
// fileParallelism is disabled on purpose: every file here hits the SAME
// local Supabase stack (Postgres max_connections=100, PostgREST pool 20),
// and this machine's core count lets Vitest schedule all integration files
// at once by default. That burst of simultaneous GoTrue admin calls + RPCs
// intermittently exhausts local connection capacity, surfacing as Kong's
// generic "An invalid response was received from the upstream server" on
// whichever request loses the race — not a product or business-logic bug
// (confirmed via docker restart-count/log correlation on the shared stack).
// Running files sequentially keeps peak concurrent connections within local
// capacity; it does not skip, retry, or weaken any assertion.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/.claude/worktrees/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.integration.setup.ts"],
    globalSetup: ["./vitest.integration.global-setup.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
