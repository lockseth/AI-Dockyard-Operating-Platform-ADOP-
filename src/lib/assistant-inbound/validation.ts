import { z } from "zod";
import { E164_PATTERN } from "@/lib/assistant-identity/validation";

// Deliberately Indonesia-only normalization (ADOP's pilot design partner —
// PT PELAYARAN GEMA BAHARI — is Indonesia-only per CLAUDE.md): a bare "0..."
// local prefix or a bare "62..." country code without "+" both resolve
// unambiguously to +62. Anything else is rejected outright rather than
// guessed (engine_chatbot.md §3.2: "Nilai tidak valid ditolak; jangan
// ditebak").
const ID_LOCAL_PREFIX = "0";
const ID_COUNTRY_CODE = "62";

export function normalizeE164Address(raw: string): string | null {
  const stripped = raw.trim().replace(/[\s\-()]/g, "");
  if (!stripped) return null;

  let candidate: string;
  if (stripped.startsWith("+")) {
    candidate = stripped;
  } else if (stripped.startsWith(ID_LOCAL_PREFIX)) {
    candidate = `+${ID_COUNTRY_CODE}${stripped.slice(1)}`;
  } else if (stripped.startsWith(ID_COUNTRY_CODE)) {
    candidate = `+${stripped}`;
  } else {
    return null;
  }

  return E164_PATTERN.test(candidate) ? candidate : null;
}

// A caller-supplied field that MUST already be a raw phone string; the
// schema below runs normalizeE164Address as a preprocess step so a route
// handler never has to remember to call it separately.
const rawSenderToE164 = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx) => {
    const normalized = normalizeE164Address(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Nomor tidak dapat dinormalisasi ke E.164." });
      return z.NEVER;
    }
    return normalized;
  });

// Canonical envelope n8n's HTTP Request node posts — minimum fields per
// task LOCK A. Deliberately strict, small bounds: this is an internal
// n8n-only contract, not a public form. messageText is capped well below
// WhatsApp's own ~4096 character limit and is NEVER persisted or logged
// (task LOCK: "jangan log messageText").
export const assistantInboundEnvelopeSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  providerMessageId: z.string().trim().min(1).max(200),
  channel: z.literal("whatsapp"),
  senderAddress: rawSenderToE164,
  receiverAddress: rawSenderToE164.optional(),
  messageText: z.string().max(4096),
  providerTimestamp: z.string().trim().min(1).max(64),
});
export type AssistantInboundEnvelopeInput = z.infer<typeof assistantInboundEnvelopeSchema>;

// Hard cap on the raw request body the route will even attempt to parse —
// checked before JSON.parse or zod (task LOCK A: "JSON size limit ketat").
export const MAX_INBOUND_BODY_BYTES = 8 * 1024;
