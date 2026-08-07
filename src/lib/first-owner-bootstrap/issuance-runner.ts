import { planIssuance } from "./issuance";
import type { IssuanceRepository } from "./issuance-repository";
import type { IssuanceInput, IssuancePlan } from "./types";

export type IssuanceReport =
  | { kind: "conflict"; reason: "tenant_already_has_owner"; detail: string }
  | { kind: "dry_run"; plan: IssuancePlan }
  | {
      kind: "issued";
      tenantId: string;
      tokenId: string;
      claimUrl: string;
      expiresAt: string;
    };

// Orchestrates one issuance run against the repository interface — kept
// separate from cli.ts (which only collects stdin input and prints this
// report) so it is unit testable against an in-memory fake repository
// without a real Supabase connection or a real stdin/readline session (the
// two-prompts-in-a-row limitation that makes piping test input into cli.ts
// itself unreliable does not apply here at all).
export async function runIssuance(
  repository: IssuanceRepository,
  input: IssuanceInput,
  apply: boolean,
  expiresHours: number,
  appUrl: string,
): Promise<IssuanceReport> {
  const state = await repository.resolveState(input.tenantSlug);
  const plan = planIssuance(state);

  if (plan.kind === "conflict") {
    return { kind: "conflict", reason: plan.reason, detail: plan.detail };
  }

  if (!apply) {
    return { kind: "dry_run", plan };
  }

  const tenantId = plan.kind === "create_tenant" ? (await repository.createTenant(input)).id : plan.tenantId;

  if (plan.kind === "reissue" && plan.revokeTokenId) {
    await repository.revokeToken(plan.revokeTokenId);
  }

  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);
  const issued = await repository.issueToken(tenantId, input.email, expiresAt);
  await repository.writeIssuedAuditEvent(tenantId, issued.tokenId, input.email);

  const claimUrl = `${appUrl.replace(/\/$/, "")}/onboarding/first-owner/${issued.rawToken}`;

  return { kind: "issued", tenantId, tokenId: issued.tokenId, claimUrl, expiresAt: issued.expiresAt };
}
