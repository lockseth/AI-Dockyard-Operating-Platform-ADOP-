import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Runtime smoke test: exercises the SAME jiti entrypoint `pnpm
// demo:owner-bootstrap` runs, not a Vitest-transpiled import of cli.ts.
// Vitest/tsc resolve the "@/..." tsconfig path alias for us, so a unit test
// importing this module's files can pass while the real `pnpm
// demo:owner-bootstrap` CLI still fails at startup with "Cannot find
// module" — this is exactly the Gate 6G-B2 regression class (jiti's plain
// CLI runner does not resolve "@/..." the way Next.js/Vitest do). --help is
// the only mode safe to run here: no env/credential read, no prompt, no
// network — see cli.ts's early-return before loadDemoEnvFile().
const require = createRequire(import.meta.url);

function runCliHelp() {
  const jitiBin = path.join(path.dirname(require.resolve("jiti/package.json")), "lib", "jiti-cli.mjs");
  const cliEntry = path.resolve(__dirname, "cli.ts");
  const repoRoot = path.resolve(__dirname, "../../..");

  return spawnSync(process.execPath, [jitiBin, cliEntry, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("demo:owner-bootstrap CLI — runtime smoke test", () => {
  it("runs the actual jiti entrypoint with --help: exits 0 with no spawn/timeout error", () => {
    const result = runCliHelp();
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
  });

  it("does not fail with a module-resolution error (the Gate 6G-B2 regression)", () => {
    const result = runCliHelp();
    expect(result.stderr).not.toMatch(/cannot find module/i);
    expect(result.stderr).not.toMatch(/MODULE_NOT_FOUND/);
  });

  it("prints usage and never reaches the identity prompt or password prompt", () => {
    const result = runCliHelp();
    expect(result.stdout).toContain("Usage: pnpm demo:owner-bootstrap");
    expect(result.stdout).not.toMatch(/Internal Founder owner email/);
    expect(result.stdout).not.toMatch(/Internal Founder owner password/i);
  });
});
