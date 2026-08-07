import { existsSync } from "node:fs";
import path from "node:path";
import { promptVisible } from "../demo-owner-bootstrap/cli-io";
import { redactEmail } from "../demo-owner-bootstrap/redact";
import { parseCliArgs } from "./cli-args";
import { createAdminClient, createIssuanceRepository } from "./issuance-repository";
import { runIssuance, type IssuanceReport } from "./issuance-runner";
import { issuanceInputSchema } from "./validation";

// Plain Node CLI entrypoint (run via `pnpm first-owner-bootstrap:issue` →
// jiti). This is the ONLY legitimate issuance path for a tenant's very
// first Owner bootstrap link — separate in every way from
// src/lib/demo-owner-bootstrap (Founder-only, locked to one internal demo
// tenant/project forever). This CLI is general-purpose: the operator types
// the real company's slug/name/email at run time, and it targets whatever
// Supabase project the environment is currently configured for (local dev
// by default) — there is no permanent target allowlist here, because unlike
// the demo harness this mechanism is meant to eventually run against the
// real hosted project in a later, separately-authorized gate.

function loadLocalEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const USAGE = `Usage: pnpm first-owner-bootstrap:issue [--apply] [--expires-hours=N] [--help]

Issues a single-use, one-time claim link that lets a brand-new tenant's very
first Owner set their own credential — without the Founder ever becoming a
member of that tenant and without public self-signup.

  (no flags)         Dry-run (default). Prompts for slug/company name/email,
                      resolves live state, and prints what would happen.
                      Never writes anything.
  --apply             Also performs the write: creates the tenant if it does
                      not exist yet (or reuses it if it exists with no active
                      owner — revoking any still-pending token first), issues
                      a fresh single-use token, and prints the claim link
                      exactly once.
  --expires-hours=N   Token lifetime in hours (default 72, max 720).
  --dry-run           Explicit no-op; dry-run is already the default.
  --help, -h           Print this message and exit.`;

interface CollectedInput {
  tenantSlug: string;
  tenantDisplayName: string;
  email: string;
}

async function collectInput(): Promise<CollectedInput> {
  const tenantSlug = await promptVisible("Tenant slug (e.g. pt-contoh-pelayaran): ");
  const tenantDisplayName = await promptVisible("Tenant display name (e.g. PT Contoh Pelayaran): ");
  const email = await promptVisible("Target owner email: ");
  return { tenantSlug, tenantDisplayName, email };
}

function printReport(report: IssuanceReport, email: string): void {
  switch (report.kind) {
    case "conflict":
      console.error(`CONFLICT (${report.reason}): ${report.detail}`);
      console.error("No changes were made.");
      process.exitCode = 1;
      return;
    case "dry_run":
      console.log("DRY RUN — no changes made.");
      if (report.plan.kind === "create_tenant") {
        console.log("Would create a new tenant and issue a bootstrap token.");
      } else if (report.plan.kind === "reissue") {
        console.log(`Would reuse existing ownerless tenant (id: ${report.plan.tenantId}) and issue a fresh bootstrap token.`);
        if (report.plan.revokeTokenId) {
          console.log(`Would first revoke the still-pending token ${report.plan.revokeTokenId}.`);
        }
      }
      console.log(`Target owner email: ${redactEmail(email)}`);
      console.log("\nRerun with --apply to issue the link.");
      return;
    case "issued":
      console.log("\nRESULT: SUCCESS");
      console.log(`Tenant: ${report.tenantId}`);
      console.log(`Owner email: ${redactEmail(email)}`);
      console.log(`Expires: ${report.expiresAt}`);
      console.log("\nOne-time claim link (deliver via an approved channel — never log or paste this elsewhere):");
      console.log(report.claimUrl);
      return;
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  loadLocalEnvFile();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const appUrl = process.env.APP_URL ?? "";

  if (!url || !serviceRoleKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured (.env.local or shell environment).");
    process.exitCode = 1;
    return;
  }
  if (!appUrl) {
    console.error("APP_URL must be configured — the claim link cannot be built without it.");
    process.exitCode = 1;
    return;
  }

  const collected = await collectInput();
  const parsed = issuanceInputSchema.safeParse(collected);
  if (!parsed.success) {
    console.error("Invalid input:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const client = createAdminClient(url, serviceRoleKey);
  const repository = createIssuanceRepository(client);

  if (args.apply) {
    console.log(`\nAbout to issue against:`);
    console.log(`  url:    ${url}`);
    console.log(`  tenant: ${parsed.data.tenantSlug} (${parsed.data.tenantDisplayName})`);
    console.log(`  owner:  ${redactEmail(parsed.data.email)}`);
    const confirmation = await promptVisible('Type "issue" to confirm: ');
    if (confirmation.trim() !== "issue") {
      console.error("Confirmation did not match \"issue\" — aborted, no changes made.");
      process.exitCode = 1;
      return;
    }
  }

  const report = await runIssuance(repository, parsed.data, args.apply, args.expiresHours, appUrl);
  printReport(report, parsed.data.email);
}

main().catch((err) => {
  console.error("Unexpected failure:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
