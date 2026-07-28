// Pure prompt orchestration for cli.ts's interactive shell. Decides which
// prompts a given mode needs without touching stdin itself, so the
// "dry-run never asks for a password" contract is unit-testable without a
// real TTY — cli.ts supplies the actual promptVisible/promptHidden I/O.
export interface IdentityPrompts {
  promptVisible(question: string): Promise<string>;
  promptHidden(question: string): Promise<string>;
}

export interface CollectedIdentity {
  email: string;
  displayName: string;
  // Present only when apply=true. Dry-run never sets this field — see
  // collectIdentityInput below.
  password?: string;
}

// Mode is decided (parseCliArgs) before this runs, so the password prompt
// is skipped outright for dry-run rather than requested-then-discarded.
export async function collectIdentityInput(
  apply: boolean,
  prompts: IdentityPrompts,
): Promise<CollectedIdentity> {
  const email = await prompts.promptVisible("Internal Founder owner email: ");
  const displayName = await prompts.promptVisible("Internal Founder owner display name: ");

  if (!apply) {
    return { email, displayName };
  }

  const password = await prompts.promptHidden("Internal Founder owner password (hidden): ");
  return { email, displayName, password };
}
