import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests need a running local Supabase stack — they run
    // separately via `pnpm test:integration`, not the default fast/offline
    // unit suite.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
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
