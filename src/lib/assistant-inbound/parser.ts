export type ParsedAssistantInboundCommand =
  | { type: "pair"; code: string }
  | { type: "verify"; code: string }
  | { type: "unsupported" };

// Mirrors the challenge alphabet from private.generate_assistant_challenge
// (20260729030000_assistant_identity_pairing.sql §2) — excludes visually
// ambiguous characters (0/O, 1/I/L) since a human retypes this over
// WhatsApp. Case-insensitive: the RPCs themselves upper() the code before
// hashing.
const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/i;

// Deliberately closed command surface (task LOCK D): exactly one keyword
// token followed by exactly one code token, nothing else. No
// natural-language approximation, no LLM — anything that doesn't match this
// exact shape is "unsupported", never a best-effort guess.
export function parseAssistantInboundCommand(messageText: string): ParsedAssistantInboundCommand {
  const trimmed = messageText.trim();
  if (!trimmed) return { type: "unsupported" };

  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 2) return { type: "unsupported" };

  const [rawKeyword, code] = tokens;
  const keyword = rawKeyword.toUpperCase();
  if (keyword !== "PAIR" && keyword !== "VERIFY") {
    return { type: "unsupported" };
  }
  if (!CODE_PATTERN.test(code)) {
    return { type: "unsupported" };
  }

  return keyword === "PAIR" ? { type: "pair", code } : { type: "verify", code };
}
