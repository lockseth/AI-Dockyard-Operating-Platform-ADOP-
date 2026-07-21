import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests need a running local Supabase stack — they run
    // separately via `pnpm test:integration`, not the default fast/offline
    // unit suite. `.claude/worktrees/**` holds isolated git worktrees the
    // Agent/task tooling creates for background sessions — without this
    // exclude, a leftover worktree's own copy of the repo gets scanned
    // alongside the real one, producing duplicate/stale test results.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts", "**/.claude/worktrees/**"],
    // Component tests (*.test.tsx) opt into jsdom individually via a
    // `// @vitest-environment jsdom` docblock at the top of the file — the
    // default stays "node" above so the much larger set of pure-logic
    // *.test.ts files keeps running at full node speed.
    setupFiles: ["./vitest.setup.ts"],
    // jsdom environment setup/teardown across ~70 parallel test files adds
    // real contention; the default 5000ms is occasionally too tight for an
    // otherwise-correct node-environment test (proven by running it alone)
    // under that load. This only widens the deadline — it does not change
    // what's asserted.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // "server-only"'s default export throws unconditionally outside
      // Next.js's bundler (which resolves it to a no-op for server
      // bundles). Point the test runner at that same no-op stub so
      // server-only modules stay importable in unit tests.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/server-only/empty.js",
      ),
    },
  },
});
