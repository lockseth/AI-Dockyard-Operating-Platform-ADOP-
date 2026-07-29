import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapAssistantIdentityError } from "./errors";
import {
  issueClientVerificationChallenge,
  issuePairingChallenge,
  listAssistantChannelIdentitiesForTenant,
  resetClientVerification,
  revokePairing,
  type AssistantChannelIdentitySummaryRow,
} from "./repository";
import type { ClientVerificationChallengeIssued, PairingChallengeIssued } from "./types";
import {
  issueClientVerificationChallengeInputSchema,
  issuePairingChallengeInputSchema,
  resetClientVerificationInputSchema,
  revokePairingInputSchema,
} from "./validation";

// Foundation-only orchestration: no webhook route, no UI, no WhatsApp send
// calls this yet (Gate 6J-B scope). These functions exist so a future
// pairing UI (Gate 6J-C+) has a ready-made, already-authorized entry point
// — every function re-derives the active tenant context and role itself,
// on top of the RPC's own re-check, matching this codebase's
// defense-in-depth convention (see expense-duplicate-detection/service.ts).

export interface AssistantIdentityActionResult<T> {
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function issuePairingChallengeForActiveTenant(
  rawInput: unknown,
): Promise<AssistantIdentityActionResult<PairingChallengeIssued>> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const parsed = issuePairingChallengeInputSchema.safeParse({
    ...(typeof rawInput === "object" && rawInput !== null ? rawInput : {}),
    tenantId: context.tenantId,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await issuePairingChallenge(parsed.data);
  if (error || !data || data.length === 0) {
    return { error: mapAssistantIdentityError(error) };
  }

  const row = data[0];
  return {
    data: {
      identityId: row.identity_id,
      challengeCode: row.challenge_code,
      challengeExpiresAt: row.challenge_expires_at,
    },
  };
}

export async function revokePairingForActiveTenant(
  rawInput: unknown,
): Promise<AssistantIdentityActionResult<AssistantChannelIdentitySummaryRow>> {
  await requireTenantContext();

  const parsed = revokePairingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await revokePairing(parsed.data);
  if (error || !data) {
    return { error: mapAssistantIdentityError(error) };
  }

  return { data };
}

export async function listAssistantChannelIdentitiesForActiveTenant(): Promise<
  AssistantChannelIdentitySummaryRow[]
> {
  const context = await requireTenantContext();
  return listAssistantChannelIdentitiesForTenant(context.tenantId);
}

export async function issueClientVerificationChallengeForActiveTenant(
  rawInput: unknown,
): Promise<AssistantIdentityActionResult<ClientVerificationChallengeIssued>> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const parsed = issueClientVerificationChallengeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await issueClientVerificationChallenge(parsed.data);
  if (error || !data || data.length === 0) {
    return { error: mapAssistantIdentityError(error) };
  }

  const row = data[0];
  return {
    data: {
      challengeCode: row.challenge_code,
      challengeExpiresAt: row.challenge_expires_at,
    },
  };
}

export async function resetClientVerificationForActiveTenant(
  rawInput: unknown,
): Promise<AssistantIdentityActionResult<unknown>> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const parsed = resetClientVerificationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { data, error } = await resetClientVerification(parsed.data);
  if (error || !data) {
    return { error: mapAssistantIdentityError(error) };
  }

  return { data };
}
