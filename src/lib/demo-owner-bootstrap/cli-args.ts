export interface CliArgs {
  apply: boolean;
  // When true, main() must print usage and exit 0 before touching env,
  // credentials, prompts, or the network — see cli.ts.
  help: boolean;
}

// Flags that would otherwise let email/password/display-name leak into shell
// history or a process list — refused outright, with a message pointing at
// the secure interactive prompt instead of silently ignoring them.
const FORBIDDEN_IDENTITY_FLAGS = ["--email", "--password", "--display-name", "--displayname", "-p"];

export function parseCliArgs(argv: string[]): CliArgs {
  let apply = false;
  let help = false;

  for (const raw of argv) {
    const arg = raw.trim();
    // `pnpm demo:owner-bootstrap -- --apply` forwards the "--" delimiter to
    // the script itself (pnpm does not strip it the way npm does) — treat
    // it as the standard end-of-flags marker, not an unknown argument.
    if (arg === "--") {
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      // Explicit no-op: dry-run is already the default without --apply.
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    const lower = arg.toLowerCase();
    const flagName = lower.split("=")[0];
    if (FORBIDDEN_IDENTITY_FLAGS.includes(flagName)) {
      throw new Error(
        `Refusing "${arg}": email/password/display name must never be passed as a CLI argument. The CLI prompts for them securely instead.`,
      );
    }

    throw new Error(`Unknown argument: "${arg}". Supported flags: --apply, --dry-run, --help.`);
  }

  return { apply, help };
}
