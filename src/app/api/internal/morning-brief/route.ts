import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/notification-outbox/internal-auth";
import { composeAndEnqueueMorningBrief, previewMorningBrief } from "@/lib/morning-brief/service";
import { morningBriefRequestSchema } from "@/lib/morning-brief/validation";

// n8n-only (Gate 6J-E1). Composes the canonical Morning Brief server-side
// from trusted ADOP read-models (never in n8n, never by an LLM) and either
// previews it (dryRun) or enqueues+claims exactly one delivery per pilot
// tenant per Asia/Jakarta business date. On a real (non-dryRun) claim, the
// response shape — { event: { id, message, recipient } } or { event: null }
// — matches /api/internal/notifications/claim's own response shape on
// purpose, so the n8n workflow's "Has Event?" branch and the Fonnte send +
// complete/fail steps that follow are the exact same graph shape as the
// existing Gate 1L workflow; completion/failure of the send is reported back
// via the existing, unmodified /api/internal/notifications/{complete,fail}
// routes. Gate 1L-R4D-R1: recipient is the pilot tenant's single verified
// owner WhatsApp number, resolved server-side before any enqueue/claim — see
// morning-brief/service.ts. A tenant with no resolvable recipient never
// reaches enqueue/claim at all (RECIPIENT_UNAVAILABLE, 503).
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = morningBriefRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const { workerId, leaseSeconds, dryRun } = parsed.data;

  if (dryRun) {
    const preview = await previewMorningBrief();
    if (preview.status === "pilot_tenant_unavailable") {
      return NextResponse.json({ error: "PILOT_TENANT_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ preview: true, businessDate: preview.businessDate, message: preview.message });
  }

  const result = await composeAndEnqueueMorningBrief({ workerId, leaseSeconds });

  if (result.status === "pilot_tenant_unavailable") {
    return NextResponse.json({ error: "PILOT_TENANT_UNAVAILABLE" }, { status: 503 });
  }

  if (result.status === "recipient_unavailable") {
    return NextResponse.json({ error: "RECIPIENT_UNAVAILABLE" }, { status: 503 });
  }

  if (result.status === "duplicate") {
    return NextResponse.json({ event: null, duplicate: true, businessDate: result.businessDate });
  }

  return NextResponse.json({ event: result.event, businessDate: result.businessDate });
}
