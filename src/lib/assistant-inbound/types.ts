import type { Tables } from "@/types/database";

// Gate 6J-C: canonical inbound WhatsApp gateway for PAIR/VERIFY only — no
// AI chat, no Public FAQ, no Morning Brief/invoice/anomaly routing. See
// ADOP_GATE_6J_A_AI_HELP_EXECUTIVE_ASSISTANT_CONTRACT_v1.0.md and
// engine_chatbot.md §12 (message idempotency) / §3.2 (E.164 normalization).

export type AssistantInboundEventRow = Tables<"assistant_inbound_events">;

export const ASSISTANT_INBOUND_CHANNEL_WHATSAPP = "whatsapp" as const;

export type AssistantInboundCommandType = "pair" | "verify" | "unsupported";

// Outcome vocabulary of assistant_complete_client_verification_by_address
// (20260730000000_assistant_inbound_gateway.sql §5) — deliberately narrower
// than the single-tenant assistant_complete_client_verification's, since a
// cross-tenant caller must never distinguish "wrong code" from "nothing
// pending anywhere" (identity enumeration).
export type ClientVerificationByAddressOutcome =
  | "verified"
  | "invalid_or_expired"
  | "locked"
  | "ambiguous"
  | "contact_inactive"
  | "duplicate_number";

// Closed reply vocabulary — the ONLY values the endpoint or n8n can ever
// see or send. Never derived from a raw RPC error or messageText (task LOCK
// H: "hanya gunakan allowlisted static templates berdasarkan safeReplyCode
// — bukan arbitrary error/messageText").
export type SafeReplyCode =
  | "paired"
  | "verified"
  | "invalid_or_expired"
  | "locked"
  | "ambiguous"
  | "duplicate"
  | "rate_limited"
  | "ignored_unsupported_command"
  | "invalid_request";

export interface AssistantInboundEnvelope {
  provider: string;
  // Absent only for provider "fonnte" — Gate 6J-C1's real-payload audit
  // found no verified stable inbound message id, so n8n omits this field
  // when Fonnte's inboxid is 0/absent and ADOP derives one server-side
  // (see derive-provider-message-id.ts).
  providerMessageId?: string;
  channel: string;
  senderAddress: string;
  receiverAddress?: string;
  messageText: string;
  providerTimestamp: string;
}

// Outbound intent only — never a send. n8n already holds the real sender
// address from its own webhook trigger, so no recipient/number is echoed
// back here (task LOCK H: "recipient normalized/masked internally").
export interface AssistantInboundReplyIntent {
  replyRequired: boolean;
  safeReplyCode: SafeReplyCode;
  providerMessageId: string;
}

export type AssistantInboundHttpResult = "processed" | "duplicate" | "rate_limited";

export interface AssistantInboundOutcome {
  httpResult: AssistantInboundHttpResult;
  reply: AssistantInboundReplyIntent;
}
