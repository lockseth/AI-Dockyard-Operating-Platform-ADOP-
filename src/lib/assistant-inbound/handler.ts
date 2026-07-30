import "server-only";
import { createHash } from "node:crypto";
import { completeOwnerAdminPairing } from "@/lib/assistant-identity/admin-repository";
import { deriveFonnteProviderMessageId } from "./derive-provider-message-id";
import { parseAssistantInboundCommand } from "./parser";
import {
  claimInboundAssistantEvent,
  completeClientVerificationByAddress,
  countRecentInboundAssistantEvents,
  recordInboundAssistantEventResult,
} from "./repository";
import { isReplyRequired } from "./safe-replies";
import type { AssistantInboundOutcome, SafeReplyCode } from "./types";
import type { AssistantInboundEnvelopeInput } from "./validation";

// Rate limit: per sender + channel + intent (engine_chatbot.md §11 "Rate
// limit diterapkan per address, tenant, intent, dan endpoint"; tenant is not
// yet known at this point, see count_recent_inbound_assistant_events'
// migration comment). DB-backed via assistant_inbound_events, not
// in-memory, so it holds across multiple app instances (task LOCK G).
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_PER_WINDOW = 10;

// Digest of the VALIDATED envelope fields alone — never the raw request
// body or messageText content (task LOCK A: "jangan simpan raw provider
// payload"). Field order is fixed so the digest is deterministic across
// retries of the exact same delivery. providerMessageId is passed in
// explicitly (rather than read off envelope) because it may have been
// derived server-side — see deriveFonnteProviderMessageId.
function payloadDigestOf(envelope: AssistantInboundEnvelopeInput, providerMessageId: string): string {
  const canonical = [envelope.provider, providerMessageId, envelope.channel, envelope.senderAddress, envelope.providerTimestamp].join(
    "|",
  );
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// assistant_complete_pairing's outcome vocabulary (verified/invalid_code/
// expired/locked/not_found/membership_invalid/ambiguous_binding, see
// 20260729030000 §5) collapses down to the closed safe-reply set here —
// invalid_code/expired/not_found/membership_invalid all become
// invalid_or_expired so a caller can never distinguish "wrong code" from
// "no such pairing exists" (identity enumeration).
function mapPairingOutcomeToSafeReply(outcome: string): SafeReplyCode {
  switch (outcome) {
    case "verified":
      return "paired";
    case "locked":
      return "locked";
    case "ambiguous_binding":
      return "ambiguous";
    default:
      return "invalid_or_expired";
  }
}

// assistant_complete_client_verification_by_address already returns the
// narrow vocabulary directly (see that function's own header) — this just
// renames "verified" contact_inactive/duplicate_number collapse into
// invalid_or_expired too, for the same enumeration-safety reason.
function mapVerificationOutcomeToSafeReply(outcome: string): SafeReplyCode {
  switch (outcome) {
    case "verified":
      return "verified";
    case "locked":
      return "locked";
    case "ambiguous":
      return "ambiguous";
    default:
      return "invalid_or_expired";
  }
}

// Orchestrator: claim (idempotency) -> parse (closed command surface) ->
// rate-limit -> dispatch PAIR/VERIFY -> map outcome -> record result ->
// return a structured reply intent. Never calls Fonnte, never sends
// anything itself — see AssistantInboundReplyIntent's own doc comment.
export async function handleAssistantInboundEvent(
  envelope: AssistantInboundEnvelopeInput,
): Promise<AssistantInboundOutcome> {
  // n8n omits providerMessageId when Fonnte's inboxid is 0/absent — derive
  // a deterministic id here rather than treating the delivery as unclaimable
  // (Gate 6J-C1: derivation happens on the ADOP server, before the claim
  // RPC, never in n8n).
  const providerMessageId = envelope.providerMessageId ?? deriveFonnteProviderMessageId(envelope);

  const parsedCommand = parseAssistantInboundCommand(envelope.messageText);

  const { eventId, isNew } = await claimInboundAssistantEvent({
    provider: envelope.provider,
    providerMessageId,
    payloadDigest: payloadDigestOf(envelope, providerMessageId),
    channel: envelope.channel,
    senderAddress: envelope.senderAddress,
    commandType: parsedCommand.type,
  });

  if (!isNew) {
    return {
      httpResult: "duplicate",
      reply: { replyRequired: false, safeReplyCode: "duplicate", providerMessageId },
    };
  }

  if (parsedCommand.type === "unsupported") {
    await recordInboundAssistantEventResult({ eventId, resultCode: "ignored_unsupported_command" });
    return {
      httpResult: "processed",
      reply: {
        replyRequired: false,
        safeReplyCode: "ignored_unsupported_command",
        providerMessageId,
      },
    };
  }

  const recentCount = await countRecentInboundAssistantEvents({
    channel: envelope.channel,
    senderAddress: envelope.senderAddress,
    commandType: parsedCommand.type,
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (recentCount > RATE_LIMIT_MAX_PER_WINDOW) {
    await recordInboundAssistantEventResult({ eventId, resultCode: "rate_limited" });
    return {
      httpResult: "processed",
      reply: { replyRequired: false, safeReplyCode: "rate_limited", providerMessageId },
    };
  }

  let safeReplyCode: SafeReplyCode;

  if (parsedCommand.type === "pair") {
    const completion = await completeOwnerAdminPairing({
      channel: envelope.channel,
      normalizedAddress: envelope.senderAddress,
      code: parsedCommand.code,
    });
    safeReplyCode = completion.result ? mapPairingOutcomeToSafeReply(completion.result.outcome) : "invalid_or_expired";
  } else {
    const completion = await completeClientVerificationByAddress({
      channel: envelope.channel,
      whatsappNumber: envelope.senderAddress,
      code: parsedCommand.code,
    });
    safeReplyCode = mapVerificationOutcomeToSafeReply(completion.outcome);
  }

  await recordInboundAssistantEventResult({ eventId, resultCode: safeReplyCode });

  return {
    httpResult: "processed",
    reply: {
      replyRequired: isReplyRequired(safeReplyCode),
      safeReplyCode,
      providerMessageId,
    },
  };
}
