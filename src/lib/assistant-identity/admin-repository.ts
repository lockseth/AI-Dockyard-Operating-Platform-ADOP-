import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClientVerificationCompletionResult, PairingCompletionResult } from "./types";
import type { CompleteClientVerificationInput, CompletePairingInput } from "./validation";

// The ONLY file in src/lib/assistant-identity allowed to reference
// @/lib/supabase/admin — enforced by admin-client-only.test.ts, same
// convention as src/lib/user-management/admin-repository.ts.
//
// assistant_complete_pairing and assistant_complete_client_verification
// model the WhatsApp-reply side of the contract, not a browser session —
// there is no Supabase Auth JWT for "the person who just replied PAIR/VERIFY
// <code> over WhatsApp." Both RPCs are granted to service_role only (see
// the migration), so this is the one place in the module that reaches for
// the admin client. No caller exists yet in this gate — the future
// /api/internal/assistant/inbound endpoint (Gate 6J-C) is what will invoke
// these, using this exact client, after verifying the n8n shared secret.

export async function completeOwnerAdminPairing(
  input: CompletePairingInput,
): Promise<{ result?: PairingCompletionResult; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("assistant_complete_pairing", {
    p_channel: input.channel,
    p_normalized_address: input.normalizedAddress,
    p_code: input.code,
  });

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? "assistant_complete_pairing returned no result" };
  }

  const row = data[0];
  return {
    result: {
      outcome: row.outcome as PairingCompletionResult["outcome"],
      identityId: row.identity_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      verifiedAt: row.verified_at,
    },
  };
}

export async function completeClientVerification(
  input: CompleteClientVerificationInput,
): Promise<{ result?: ClientVerificationCompletionResult; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("assistant_complete_client_verification", {
    p_tenant_id: input.tenantId,
    p_whatsapp_number: input.whatsappNumber,
    p_code: input.code,
  });

  if (error || !data || data.length === 0) {
    return { error: error?.message ?? "assistant_complete_client_verification returned no result" };
  }

  const row = data[0];
  return {
    result: {
      outcome: row.outcome as ClientVerificationCompletionResult["outcome"],
      contactId: row.contact_id,
      tenantId: row.tenant_id,
      verifiedAt: row.verified_at,
    },
  };
}
