import type { Enums, Tables } from "@/types/database";

// Gate 6J-B foundation only: schema + RPC surface for GEMA Assistant channel
// identity pairing (Owner/Admin) and client WhatsApp verification (External
// Client PIC candidate identity). No webhook, no AI, no WhatsApp send — see
// ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md §9/§21.

export type AssistantChannelIdentityStatus = Enums<"assistant_channel_identity_status">;
export type ClientWhatsappVerificationStatus = Enums<"client_whatsapp_verification_status">;

export type AssistantChannelIdentityRow = Tables<"assistant_channel_identities">;

// Only channel supported by the migration's CHECK constraint (channel = 'whatsapp').
export const ASSISTANT_CHANNEL_WHATSAPP = "whatsapp" as const;
export type AssistantChannel = typeof ASSISTANT_CHANNEL_WHATSAPP;

// Mirrors the `outcome` column returned by assistant_complete_pairing —
// deliberately a structured result rather than a thrown Postgres error, so
// a failed attempt's counter/audit write survives (see the migration's
// header comment on why `raise exception` after a write is unsafe here).
export type PairingCompletionOutcome =
  | "verified"
  | "invalid_code"
  | "expired"
  | "locked"
  | "not_found"
  | "membership_invalid"
  | "ambiguous_binding";

export interface PairingChallengeIssued {
  identityId: string;
  challengeCode: string;
  challengeExpiresAt: string;
}

export interface PairingCompletionResult {
  outcome: PairingCompletionOutcome;
  identityId: string | null;
  tenantId: string | null;
  userId: string | null;
  verifiedAt: string | null;
}

export type ClientVerificationCompletionOutcome =
  | "verified"
  | "invalid_code"
  | "expired"
  | "locked"
  | "not_found"
  | "ambiguous"
  | "contact_inactive"
  | "duplicate_number";

export interface ClientVerificationChallengeIssued {
  challengeCode: string;
  challengeExpiresAt: string;
}

export interface ClientVerificationCompletionResult {
  outcome: ClientVerificationCompletionOutcome;
  contactId: string | null;
  tenantId: string | null;
  verifiedAt: string | null;
}

// Gate 1L-R4A: the Owner's own WhatsApp recipient registration, as
// displayed on Settings/Personal. Deliberately collapses the underlying
// assistant_channel_identity_status enum's 'revoked' into 'not_registered'
// — a revoked-with-nothing-newer row means "nothing currently registered"
// from the Owner's point of view (task LOCK: exactly three ringkas states).
export type OwnerWhatsappRegistrationStatus = "not_registered" | "pending" | "verified";

export interface OwnerWhatsappRegistration {
  status: OwnerWhatsappRegistrationStatus;
  normalizedAddress: string | null;
  challengeExpiresAt: string | null;
}

export type RegisterOwnerWhatsappOutcome = "challenge_issued" | "already_verified";

export interface RegisterOwnerWhatsappResult {
  outcome: RegisterOwnerWhatsappOutcome;
  normalizedAddress: string;
  challengeCode?: string;
  challengeExpiresAt?: string;
}
