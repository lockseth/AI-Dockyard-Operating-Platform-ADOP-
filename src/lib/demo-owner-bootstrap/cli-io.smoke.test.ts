import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Runtime smoke test: exercises the real jiti entrypoint over a real child
// process's piped stdin/stdout, not just in-process streams (see
// cli-io.test.ts for the finer-grained unit coverage). This is the
// portable, dependency-free substitute for a full PTY test — it can't
// reproduce Windows terminal-driver echo quirks, but it does exercise the
// same "does the process hang / exit silently" failure mode at the actual
// process level, which is what Gate 6G-B3's EOF bug was. No cloud/network
// access: cli-io.smoke-entry.ts only imports ./cli-io, never
// repository.ts/executor.ts.
//
// Writes are paced off the child's own stdout instead of handed to it in
// one bulk buffer — this module's prompts are built for genuine
// interactive use (a person typing an answer only after seeing the
// question), and feeding every answer ahead of time doesn't exercise that;
// it exercises a different, unsupported "batch script" usage instead.
const require = createRequire(import.meta.url);

function runSmokeEntry(answers: string[], { closeAfter }: { closeAfter: boolean }): Promise<{
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  const jitiBin = path.join(path.dirname(require.resolve("jiti/package.json")), "lib", "jiti-cli.mjs");
  const entry = path.resolve(__dirname, "cli-io.smoke-entry.ts");
  const repoRoot = path.resolve(__dirname, "../../..");

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [jitiBin, entry], { cwd: repoRoot });

    let stdout = "";
    let stderr = "";
    let answered = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);

    // One prompt's question text always precedes its answer, in order:
    // "Email: " -> "Display name: " -> "Password (hidden): " -> "Confirm: ".
    // Writing the next answer only after the prompt for it has appeared
    // mirrors a real terminal session instead of racing ahead of it.
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (answered < answers.length && stdout.length > 0) {
        const next = answers[answered];
        answered += 1;
        child.stdin.write(`${next}\n`);
        if (answered === answers.length && closeAfter) {
          child.stdin.end();
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, timedOut });
    });
  });
}

describe("demo:owner-bootstrap cli-io — runtime smoke test", () => {
  it("runs email -> displayName -> hidden password -> confirmation token -> report, in order", async () => {
    const secret = "S3cret-Runtime-Value-9";
    const result = await runSmokeEntry(
      ["founder-demo@example.test", "Founder Demo Owner", secret, "CONFIRM-TOKEN"],
      { closeAfter: false },
    );

    expect(result.timedOut).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("EMAIL:founder-demo@example.test");
    expect(result.stdout).toContain("DISPLAYNAME:Founder Demo Owner");
    expect(result.stdout).toContain(`PASSWORD_LEN:${secret.length}`);
    expect(result.stdout).toContain("TOKEN:CONFIRM-TOKEN");
    expect(result.stdout).not.toContain(secret);
    expect(result.stderr).not.toContain(secret);
  }, 35_000);

  it("an EOF confirmation token (stdin closes before a token is typed) exits cleanly instead of hanging", async () => {
    const secret = "S3cret-Runtime-Value-9";
    const result = await runSmokeEntry(["founder-demo@example.test", "Founder Demo Owner", secret], {
      closeAfter: true,
    });

    expect(result.timedOut).toBe(false);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("TOKEN:\n");
    expect(result.stdout).not.toContain(secret);
  }, 35_000);
});
