import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/notification-outbox/internal-auth";
import { claimNextNotificationForDelivery } from "@/lib/notification-outbox/service";
import { claimNotificationRequestSchema } from "@/lib/notification-outbox/validation";

// n8n-only. Claims at most one pending (or lease-expired) notification and
// returns the exact WhatsApp text to send — n8n never composes the message
// itself and never sees tenant_id, batch id, or any other internal
// reference beyond the notification event id it needs to complete/fail.
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = claimNotificationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const claimed = await claimNextNotificationForDelivery(parsed.data);
  return NextResponse.json({ event: claimed });
}
