import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/notification-outbox/internal-auth";
import { NotificationClaimMismatchError, completeNotificationDelivery } from "@/lib/notification-outbox/service";
import { completeNotificationRequestSchema } from "@/lib/notification-outbox/validation";

// n8n-only. Marks a notification this worker currently holds the claim on
// as sent — this endpoint can never approve, reject, or mutate any
// financial record; it only ever touches notification_events.
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = completeNotificationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await completeNotificationDelivery(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NotificationClaimMismatchError) {
      return NextResponse.json({ error: "NOTIFICATION_CLAIM_MISMATCH" }, { status: 409 });
    }
    throw error;
  }
}
