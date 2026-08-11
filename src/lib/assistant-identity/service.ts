import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapAssistantIdentityError } from "./errors";
import {
  getLatestAssistantChannelIdentityForUser,
  issueClientVerificationChallenge,
  issuePairingChallenge,
  listAssistantChannelIdentitiesForTenant,
  resetClientVerification,
  revokePairing,
  type AssistantChannelIdentitySummaryRow,
} from "./repository";
import { ASSISTANT_CHANNEL_WHATSAPP } from "./types";
import type {
  ClientVerificationChallengeIssued,
  OwnerWhatsappRegistration,
  PairingChallengeIssued,
  RegisterOwnerWhatsappResult,
} from "./types";
import {
  issueClientVerificationChallengeInputSchema,
  issuePairingChallengeInputSchema,
  normalizeE164Address,
  registerOwnerWhatsappNumberInputSchema,
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

// =============================================================================
// Gate 1L-R4A — Simple Owner WhatsApp Registration
//
// Owner-only (canAccessOwnerWhatsappRegistration / requireTenantRole below —
// deliberately narrower than issuePairingChallengeForActiveTenant's
// owner+admin, see access.ts). Both functions re-derive tenant/user/role
// from the caller's own session on every call; a client can never supply
// its own user_id/tenant_id/role (task LOCK: "Jangan menerima user_id,
// tenant_id, atau role dari form/client").
//
// No new RPC, no new table: this orchestrates the exact same
// assistant_issue_pairing_challenge / assistant_revoke_pairing RPCs the
// Gate 6J-B foundation already exposes through repository.ts, plus one new
// read (getLatestAssistantChannelIdentityForUser) to know what "current
// state" means for a single Owner+channel. resolve_verified_owner_recipient
// (Gate 1L-R2/R3) already sources directly from this same table/status —
// there is no second recipient path to build or keep in sync.
// =============================================================================

export async function getOwnerWhatsappRegistrationForActiveTenant(): Promise<OwnerWhatsappRegistration> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const row = await getLatestAssistantChannelIdentityForUser({
    tenantId: context.tenantId,
    userId: context.userId,
    channel: ASSISTANT_CHANNEL_WHATSAPP,
  });

  // A missing row, or the newest row being 'revoked', both mean "nothing is
  // currently registered" from the Owner's point of view — see the
  // OwnerWhatsappRegistrationStatus comment in types.ts.
  if (!row || row.status === "revoked") {
    return { status: "not_registered", normalizedAddress: null, challengeExpiresAt: null };
  }

  return {
    status: row.status,
    normalizedAddress: row.normalized_address,
    challengeExpiresAt: row.status === "pending" ? row.challenge_expires_at : null,
  };
}

export async function registerOwnerWhatsappNumberForActiveTenant(
  rawInput: unknown,
): Promise<AssistantIdentityActionResult<RegisterOwnerWhatsappResult>> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const parsed = registerOwnerWhatsappNumberInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const normalized = normalizeE164Address(parsed.data.rawNumber);
  if (!normalized) {
    return {
      fieldErrors: {
        rawNumber: ["Nomor tidak valid. Gunakan format 08xxxxxxxxxx, 628xxxxxxxxxx, atau +628xxxxxxxxxx."],
      },
    };
  }

  const current = await getLatestAssistantChannelIdentityForUser({
    tenantId: context.tenantId,
    userId: context.userId,
    channel: ASSISTANT_CHANNEL_WHATSAPP,
  });

  // Resubmitting the exact number that is already verified is a pure no-op
  // — never re-issues a challenge (which would put an already-trusted
  // number back into 'pending'), never touches verified_at.
  if (current?.status === "verified" && current.normalized_address === normalized) {
    return { data: { outcome: "already_verified", normalizedAddress: normalized } };
  }

  // Changing to a DIFFERENT number while a verified one exists must revoke
  // the old verified binding first (task LOCK: "Perubahan nomor wajib
  // mencabut status verifikasi sebelumnya") — otherwise
  // assistant_complete_pairing's own ambiguous-binding guard would simply
  // refuse to ever verify the new number while the old one still stands.
  // A merely 'pending' (not yet verified) prior row needs no explicit
  // revoke here: assistant_issue_pairing_challenge below already
  // invalidates any pending row for this exact (tenant, user, channel)
  // itself, regardless of address.
  if (current?.status === "verified" && current.normalized_address !== normalized) {
    const { error: revokeError } = await revokePairing({
      identityId: current.id,
      reason: "owner_number_changed",
    });
    if (revokeError) {
      return { error: mapAssistantIdentityError(revokeError) };
    }
  }

  const { data, error } = await issuePairingChallenge({
    tenantId: context.tenantId,
    channel: ASSISTANT_CHANNEL_WHATSAPP,
    normalizedAddress: normalized,
  });
  if (error || !data || data.length === 0) {
    return { error: mapAssistantIdentityError(error) };
  }

  const row = data[0];
  return {
    data: {
      outcome: "challenge_issued",
      normalizedAddress: normalized,
      challengeCode: row.challenge_code,
      challengeExpiresAt: row.challenge_expires_at,
    },
  };
}
