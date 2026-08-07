export interface CliArgs {
  apply: boolean;
  help: boolean;
  // Default 72h — long enough for an operator to hand off the link through
  // a normal channel, short enough that an unclaimed link doesn't sit live
  // indefinitely. Always explicit here rather than only living in the RPC,
  // so the CLI can print the exact expiry it is about to set.
  expiresHours: number;
}

const DEFAULT_EXPIRES_HOURS = 72;

// Slug/display-name/email are not secrets, but they're still never accepted
// as flags — this CLI is interactive-only (prompts) so the exact same
// operator-facing "about to issue against..." confirmation step demo-owner-
// bootstrap's cli.ts uses always runs, and nothing meaningful can be
// scripted/automated past it by accident.
const FORBIDDEN_IDENTITY_FLAGS = ["--slug", "--company", "--display-name", "--email"];

export function parseCliArgs(argv: string[]): CliArgs {
  let apply = false;
  let help = false;
  let expiresHours = DEFAULT_EXPIRES_HOURS;

  for (const raw of argv) {
    const arg = raw.trim();
    if (arg === "--") {
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg.startsWith("--expires-hours=")) {
      const value = Number(arg.slice("--expires-hours=".length));
      if (!Number.isFinite(value) || value <= 0 || value > 24 * 30) {
        throw new Error("--expires-hours must be a number between 1 and 720 (30 days).");
      }
      expiresHours = value;
      continue;
    }

    const lower = arg.toLowerCase();
    const flagName = lower.split("=")[0];
    if (FORBIDDEN_IDENTITY_FLAGS.includes(flagName)) {
      throw new Error(
        `Refusing "${arg}": tenant slug/name/email must never be passed as a CLI argument. The CLI prompts for them instead.`,
      );
    }

    throw new Error(`Unknown argument: "${arg}". Supported flags: --apply, --dry-run, --expires-hours=N, --help.`);
  }

  return { apply, help, expiresHours };
}
