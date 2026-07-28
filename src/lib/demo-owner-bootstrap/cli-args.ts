export interface CliArgs {
  apply: boolean;
}

// Flags that would otherwise let email/password/display-name leak into shell
// history or a process list — refused outright, with a message pointing at
// the secure interactive prompt instead of silently ignoring them.
const FORBIDDEN_IDENTITY_FLAGS = ["--email", "--password", "--display-name", "--displayname", "-p"];

export function parseCliArgs(argv: string[]): CliArgs {
  let apply = false;

  for (const raw of argv) {
    const arg = raw.trim();
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      // Explicit no-op: dry-run is already the default without --apply.
      continue;
    }

    const lower = arg.toLowerCase();
    const flagName = lower.split("=")[0];
    if (FORBIDDEN_IDENTITY_FLAGS.includes(flagName)) {
      throw new Error(
        `Refusing "${arg}": email/password/display name must never be passed as a CLI argument. The CLI prompts for them securely instead.`,
      );
    }

    throw new Error(`Unknown argument: "${arg}". Supported flags: --apply, --dry-run.`);
  }

  return { apply };
}
