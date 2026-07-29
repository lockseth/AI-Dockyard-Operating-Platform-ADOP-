import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AssistantInboundCommandType, ClientVerificationByAddressOutcome } from "./types";

// The ONLY file in src/lib/assistant-inbound allowed to reference
// @/lib/supabase/admin directly — enforced by admin-client-only.test.ts,
// same convention as src/lib/notification-outbox/repository.ts. The PAIR
// completion RPC (assistant_complete_pairing) is deliberately NOT re-wrapped
// here — handler.ts calls the already-audited completeOwnerAdminPairing
// from @/lib/assistant-identity/admin-repository instead of a second admin
// client for the exact same RPC (that module's own admin-client-only.test.ts
// guards it as the sole caller within its directory).

export async function claimInboundAssistantEvent(params: {
  provider: string;
  providerMessageId: string;
  payloadDigest: string;
  channel: string;
  senderAddress: string;
  commandType: AssistantInboundCommandType;
}): Promise<{ eventId: string; isNew: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_inbound_assistant_event", {
    p_provider: params.provider,
    p_provider_message_id: params.providerMessageId,
    p_payload_digest: params.payloadDigest,
    p_channel: params.channel,
    p_sender_address: params.senderAddress,
    p_command_type: params.commandType,
  });
  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "claim_inbound_assistant_event returned no result");
  }
  const row = data[0];
  return { eventId: row.event_id, isNew: row.is_new };
}

export async function recordInboundAssistantEventResult(params: {
  eventId: string;
  resultCode: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("record_inbound_assistant_event_result", {
    p_event_id: params.eventId,
    p_result_code: params.resultCode,
  });
  if (error) throw error;
}

export async function countRecentInboundAssistantEvents(params: {
  channel: string;
  senderAddress: string;
  commandType: AssistantInboundCommandType;
  windowSeconds?: number;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("count_recent_inbound_assistant_events", {
    p_channel: params.channel,
    p_sender_address: params.senderAddress,
    p_command_type: params.commandType,
    p_window_seconds: params.windowSeconds,
  });
  if (error) throw error;
  return data ?? 0;
}

export interface ClientVerificationByAddressResult {
  outcome: ClientVerificationByAddressOutcome;
  contactId: string | null;
  tenantId: string | null;
  verifiedAt: string | null;
}

export async function completeClientVerificationByAddress(params: {
  channel: string;
  whatsappNumber: string;
  code: string;
}): Promise<ClientVerificationByAddressResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("assistant_complete_client_verification_by_address", {
    p_channel: params.channel,
    p_whatsapp_number: params.whatsappNumber,
    p_code: params.code,
  });
  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "assistant_complete_client_verification_by_address returned no result");
  }
  const row = data[0];
  return {
    outcome: row.outcome as ClientVerificationByAddressOutcome,
    contactId: row.contact_id,
    tenantId: row.tenant_id,
    verifiedAt: row.verified_at,
  };
}
