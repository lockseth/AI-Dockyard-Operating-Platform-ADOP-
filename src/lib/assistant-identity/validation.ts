import { z } from "zod";
import { idSchema } from "@/lib/master-data/shared/validation";
import { ASSISTANT_CHANNEL_WHATSAPP } from "./types";

// Mirrors the CHECK constraint on assistant_channel_identities.normalized_address
// and client_contacts.whatsapp_number (migration §3/§9): '+' then 7-15 digits,
// first digit non-zero. Kept as a single exported regex so both this schema
// and any future normalization helper stay in sync with the same rule.
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

export const normalizedAddressSchema = z
  .string()
  .trim()
  .regex(E164_PATTERN, "Nomor harus dalam format E.164 (contoh: +6281234567890).");

export const assistantChannelSchema = z.literal(ASSISTANT_CHANNEL_WHATSAPP);

export const issuePairingChallengeInputSchema = z.object({
  tenantId: idSchema,
  channel: assistantChannelSchema,
  normalizedAddress: normalizedAddressSchema,
});
export type IssuePairingChallengeInput = z.infer<typeof issuePairingChallengeInputSchema>;

export const revokePairingInputSchema = z.object({
  identityId: idSchema,
  reason: z.string().trim().max(500).optional(),
});
export type RevokePairingInput = z.infer<typeof revokePairingInputSchema>;

export const issueClientVerificationChallengeInputSchema = z.object({
  contactId: idSchema,
});
export type IssueClientVerificationChallengeInput = z.infer<
  typeof issueClientVerificationChallengeInputSchema
>;

export const resetClientVerificationInputSchema = z.object({
  contactId: idSchema,
  reason: z.string().trim().max(500).optional(),
});
export type ResetClientVerificationInput = z.infer<typeof resetClientVerificationInputSchema>;

// Server-side completion inputs (service-role, no browser session) — the
// challenge code is the proof of possession, so these validate shape only.
export const completePairingInputSchema = z.object({
  channel: assistantChannelSchema,
  normalizedAddress: normalizedAddressSchema,
  code: z.string().trim().min(1, "Kode wajib diisi."),
});
export type CompletePairingInput = z.infer<typeof completePairingInputSchema>;

export const completeClientVerificationInputSchema = z.object({
  tenantId: idSchema,
  whatsappNumber: normalizedAddressSchema,
  code: z.string().trim().min(1, "Kode wajib diisi."),
});
export type CompleteClientVerificationInput = z.infer<typeof completeClientVerificationInputSchema>;
