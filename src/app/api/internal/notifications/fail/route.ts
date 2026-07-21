import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/notification-outbox/internal-auth";
import { NotificationClaimMismatchError, failNotificationDelivery } from "@/lib/notification-outbox/service";
import { failNotificationRequestSchema } from "@/lib/notification-outbox/validation";

// n8n-only. Records a delivery failure this worker currently holds the
// claim on — the RPC underneath decides pending (retryable) vs failed
// (terminal) from attempt_count/max_attempts; this endpoint never approves,
// rejects, or mutates any financial record.
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = failNotificationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  try {
    const result = await failNotificationDelivery(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NotificationClaimMismatchError) {
      return NextResponse.json({ error: "NOTIFICATION_CLAIM_MISMATCH" }, { status: 409 });
    }
    throw error;
  }
}
