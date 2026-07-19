import path from "node:path";
import { defineConfig } from "vitest/config";

// Requires a running local Supabase stack (`pnpm supabase:start`). Run via
// `pnpm test:integration` — kept out of the default `pnpm test` suite since
// it needs Docker/network, not just source files.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["./vitest.integration.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
