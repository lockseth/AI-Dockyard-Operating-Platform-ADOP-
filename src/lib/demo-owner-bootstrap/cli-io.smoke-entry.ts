// Test-only fixture for cli-io.smoke.test.ts. Drives the exact prompt
// sequence cli.ts's main() drives (email → displayName → hidden password →
// confirmation token) through a real child process's stdin/stdout, so the
// regression coverage includes actual process-level EOF/exit behavior that
// an in-process PassThrough test can't fully exercise. Never prints the
// password — only its length — so a leak would show up as the literal
// secret string appearing in captured stdout, not as an expected field.
import { promptHidden, promptVisible } from "./cli-io";

async function main(): Promise<void> {
  const email = await promptVisible("Email: ");
  const displayName = await promptVisible("Display name: ");
  const password = await promptHidden("Password (hidden): ");
  const confirmationToken = await promptVisible("Confirm: ");

  process.stdout.write(`EMAIL:${email}\n`);
  process.stdout.write(`DISPLAYNAME:${displayName}\n`);
  process.stdout.write(`PASSWORD_LEN:${password.length}\n`);
  process.stdout.write(`TOKEN:${confirmationToken}\n`);
}

main().catch((err) => {
  console.error("SMOKE_ENTRY_FAILURE:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
