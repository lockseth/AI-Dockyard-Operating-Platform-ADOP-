import "server-only";
import { createHash } from "node:crypto";
import type { AssistantInboundEnvelopeInput } from "./validation";

// Fonnte's inbound webhook has no verified stable per-message id (Gate
// 6J-C1 audit): senderid is a WhatsApp sender identity/LID, not a message
// id, and inboxid can be 0/absent. When n8n cannot supply a trustworthy
// providerMessageId, ADOP derives one here — never n8n's execution id or
// receive-time, either of which would break idempotency on a genuine
// provider retry (task LOCK: derive on the ADOP server, not n8n).
const DERIVED_ID_VERSION = "v1";

// This gateway only ever processes PAIR/VERIFY text commands (task LOCK
// D). "text" is a fixed v1 constant, not read from any Fonnte field —
// Fonnte's public docs document no message-type field on the inbound
// webhook (Gate 6J-C1 audit). Bump DERIVED_ID_VERSION if a future message
// type needs disambiguating from plain text.
const DERIVED_ID_MESSAGE_TYPE = "text";

// Length-prefixes every field so no delimiter can ever be ambiguous with
// field content — e.g. a naive "|" join of ["1|2", "3"] and ["1", "2|3"]
// both serialize to "1|2|3"; length-prefixing keeps them distinct.
export function canonicalSerialize(fields: string[]): string {
  return fields.map((field) => `${Buffer.byteLength(field, "utf8")}:${field}`).join("");
}

// Deterministic providerMessageId for Fonnte deliveries that arrive
// without a trustworthy inboxid. Same delivery retried verbatim (same
// sender/device/message/timestamp) -> same id, so the unique constraint on
// (provider, provider_message_id) dedupes it exactly like a real retry
// would. Same sender/device/message at a different providerTimestamp ->
// a different id, so two distinct messages are never conflated.
export function deriveFonnteProviderMessageId(envelope: AssistantInboundEnvelopeInput): string {
  if (envelope.provider !== "fonnte") {
    throw new Error("deriveFonnteProviderMessageId called for a non-fonnte provider.");
  }
  if (!envelope.receiverAddress) {
    throw new Error("receiverAddress is required to derive a Fonnte providerMessageId.");
  }

  const canonical = canonicalSerialize([
    "fonnte",
    envelope.receiverAddress,
    envelope.senderAddress,
    envelope.providerTimestamp,
    DERIVED_ID_MESSAGE_TYPE,
    envelope.messageText,
  ]);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `fonnte:derived:${DERIVED_ID_VERSION}:${digest}`;
}
