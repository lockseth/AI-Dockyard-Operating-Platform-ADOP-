import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ALLOWED_TARGET } from "./target";
import { DEMO_TENANT_IDENTITY } from "./identity";
import { ownerBootstrapIdentitySchema, ownerIdentityFieldsSchema } from "./validation";
import { createAdminClient, createSupabaseRepository } from "./repository";
import { buildExpectedConfirmationToken, runBootstrap } from "./executor";
import { parseCliArgs } from "./cli-args";
import { collectIdentityInput } from "./cli-flow";
import { redactEmail } from "./redact";
import type { RunReport } from "./types";

// Plain Node CLI entrypoint (run via `pnpm demo:owner-bootstrap` → jiti — see
// package.json and this module's README.md). This is the only file in the
// module that touches stdin/stdout/env directly; every decision it makes is
// delegated to executor.ts/plan.ts/target.ts, which are pure and unit
// tested without any network access. This file itself is intentionally NOT
// executed against the cloud target as part of Gate 6G-B (build+test only).

// Mirrors vitest.integration.setup.ts's convention, but loads
// .env.demo.local (this harness's target, per .env.example) instead of
// .env.local (the local dev stack).
function loadDemoEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env.demo.local");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function promptVisible(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));
}

// No masked-input package available/needed — raw-mode stdin muting is the
// standard dependency-free recipe for hiding a terminal password prompt.
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(question);

    let value = "";
    const canMask = typeof stdin.setRawMode === "function" && stdin.isTTY;
    if (canMask) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      const code = chunk.charCodeAt(0);
      // Enter (LF/CR) or Ctrl-D (EOF) ends input.
      if (code === 10 || code === 13 || code === 4) {
        cleanup();
        stdout.write("\n");
        resolve(value);
        return;
      }
      // Ctrl-C aborts.
      if (code === 3) {
        cleanup();
        reject(new Error("Aborted."));
        return;
      }
      // DEL or backspace.
      if (code === 127 || code === 8) {
        value = value.slice(0, -1);
        return;
      }
      value += chunk;
    };

    function cleanup() {
      if (canMask) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.removeListener("data", onData);
    }

    stdin.on("data", onData);
  });
}

const USAGE = `Usage: pnpm demo:owner-bootstrap [--apply] [--help]

Provisions the internal Founder owner (Gate 6G-B) for the ADOP Demo tenant.

  (no flags)   Dry-run (default). Read-only: prompts for email + display
               name only, resolves live state, and prints the plan. Never
               prompts for a password, never writes.
  --apply      Also prompts for the hidden password and an exact typed
               confirmation token before making any change.
  --dry-run    Explicit no-op; dry-run is already the default.
  --help, -h   Print this message and exit. Reads no env/credential file,
               prompts for nothing, makes no network call.

See src/lib/demo-owner-bootstrap/README.md for the full contract.`;

function printReport(report: RunReport): void {
  switch (report.kind) {
    case "target_rejected":
      console.error(`TARGET REJECTED (${report.reason}): ${report.detail}`);
      return;
    case "conflict":
      console.error(`CONFLICT (${report.reason}): ${report.detail}`);
      console.error("No changes were made. Resolve the conflict manually before rerunning.");
      return;
    case "dry_run":
      console.log(`DRY RUN — target: ${ALLOWED_TARGET.ref} / tenant: ${DEMO_TENANT_IDENTITY.slug}`);
      console.log(report.plan.allNoop ? "No changes needed (already provisioned)." : "Planned steps:");
      for (const step of report.plan.steps) {
        console.log(`  [${step.action}] ${step.id} — ${step.detail}`);
      }
      console.log("\nRerun with --apply and confirm the exact token to make changes.");
      return;
    case "confirmation_required":
      console.error("APPLY requires the exact confirmation token. Expected:");
      console.error(`  ${report.expectedToken}`);
      return;
    case "applied":
      console.log(`RESULT: ${report.success ? "SUCCESS" : "PARTIAL FAILURE"}`);
      console.log(`Tenant: ${report.tenantId}`);
      console.log(`Completed: ${report.completed.join(", ") || "(none)"}`);
      if (report.failedAt) {
        console.log(`Failed at: ${report.failedAt}`);
      }
      if (report.pending.length > 0) {
        console.log(`Pending (rerun to continue): ${report.pending.join(", ")}`);
      }
      return;
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  // Checked before loadDemoEnvFile()/any process.env read, before the
  // readline interface is created, and before repository.createAdminClient
  // ever runs — --help must never touch env/credentials, prompt for
  // identity, or make a network call.
  if (args.help) {
    console.log(USAGE);
    return;
  }

  loadDemoEnvFile();

  const target = {
    ref: process.env.SUPABASE_PROJECT_REF ?? "",
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  };
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    // Mode is already decided (args.apply) before any identity/secret
    // prompt runs — collectIdentityInput skips the hidden password prompt
    // outright for dry-run instead of requesting then discarding it.
    const collected = await collectIdentityInput(args.apply, {
      promptVisible: (question) => promptVisible(rl, question),
      promptHidden,
    });

    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured. Set it via .env.demo.local or the shell environment.");
      process.exitCode = 1;
      return;
    }

    const client = createAdminClient(target.url, serviceRoleKey);
    const repository = createSupabaseRepository(client);

    if (!args.apply) {
      // Dry-run: read-only. No password field exists on `collected` here,
      // and ownerIdentityFieldsSchema has no password to require/validate.
      const parsed = ownerIdentityFieldsSchema.safeParse(collected);
      if (!parsed.success) {
        console.error("Invalid input:");
        for (const issue of parsed.error.issues) {
          console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
        }
        process.exitCode = 1;
        return;
      }

      const report = await runBootstrap({
        repository,
        target,
        tenantIdentity: DEMO_TENANT_IDENTITY,
        identity: parsed.data,
        apply: false,
      });

      printReport(report);
      if (report.kind !== "dry_run") {
        process.exitCode = 1;
      }
      return;
    }

    // Apply: hidden password + exact confirmation token, both still required.
    const parsed = ownerBootstrapIdentitySchema.safeParse(collected);
    if (!parsed.success) {
      console.error("Invalid input:");
      for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }

    const expected = buildExpectedConfirmationToken(ALLOWED_TARGET, DEMO_TENANT_IDENTITY.slug);
    console.log(`\nAbout to APPLY against:`);
    console.log(`  ref:    ${ALLOWED_TARGET.ref}`);
    console.log(`  url:    ${ALLOWED_TARGET.url}`);
    console.log(`  tenant: ${DEMO_TENANT_IDENTITY.slug} (${DEMO_TENANT_IDENTITY.displayName})`);
    console.log(`  owner:  ${redactEmail(parsed.data.email)}`);
    const confirmationToken = await promptVisible(rl, `Type "${expected}" to confirm: `);

    const report = await runBootstrap({
      repository,
      target,
      tenantIdentity: DEMO_TENANT_IDENTITY,
      identity: { email: parsed.data.email, displayName: parsed.data.displayName },
      apply: true,
      password: parsed.data.password,
      confirmationToken,
    });

    printReport(report);
    if (report.kind !== "applied" || !report.success) {
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Unexpected failure:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
