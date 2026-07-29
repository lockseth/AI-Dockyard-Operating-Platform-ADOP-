import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env/server";
import { handleAssistantInboundEvent } from "@/lib/assistant-inbound/handler";
import { isAuthorizedInternalRequest } from "@/lib/notification-outbox/internal-auth";
import { verifyInboundSignature } from "@/lib/assistant-inbound/signature";
import { assistantInboundEnvelopeSchema, MAX_INBOUND_BODY_BYTES } from "@/lib/assistant-inbound/validation";

// Canonical n8n-only inbound gateway for the GEMA Assistant PAIR/VERIFY
// commands (Gate 6J-C). Narrow on purpose: no AI chat, no Public FAQ, no
// Morning Brief/invoice/anomaly routing lives behind this route.
//
// Authorization is two layers, both fail-closed, both required:
//   1. x-internal-secret — the same baseline every other /api/internal/*
//      route already uses (src/lib/notification-outbox/internal-auth.ts).
//   2. x-assistant-signature / x-assistant-signature-timestamp — an HMAC
//      over the timestamp + EXACT raw request body, verified BEFORE the
//      body is ever JSON.parsed (src/lib/assistant-inbound/signature.ts).
//
// Never logs messageText, challenge codes, full phone numbers, or secrets.
// Never stores the raw request body — only a digest of the validated
// envelope (see handler.ts's payloadDigestOf).
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > MAX_INBOUND_BODY_BYTES) {
    return NextResponse.json({ result: "invalid_request" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return NextResponse.json({ result: "invalid_request" }, { status: 400 });
  }

  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const env = getServerEnv();
  const signatureOk = verifyInboundSignature({
    rawBody,
    timestampHeader: request.headers.get("x-assistant-signature-timestamp"),
    signatureHeader: request.headers.get("x-assistant-signature"),
    secret: env.INTERNAL_ASSISTANT_INBOUND_SIGNING_SECRET,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!signatureOk) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ result: "invalid_request" }, { status: 400 });
  }

  const parsed = assistantInboundEnvelopeSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ result: "invalid_request" }, { status: 400 });
  }

  const outcome = await handleAssistantInboundEvent(parsed.data);
  return NextResponse.json({ result: outcome.httpResult, reply: outcome.reply });
}
