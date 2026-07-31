import "server-only";
import { getServerEnv } from "@/lib/env/server";
import { enqueueAndClaimMorningBriefDelivery } from "@/lib/notification-outbox/service";
import { getJakartaBusinessDate } from "@/lib/operations-daily/format";
import { composeMorningBrief } from "./composer";
import { getExecutiveReportSummaryForTenant } from "./read-model";
import { resolvePilotTenant } from "./repository";

function executiveReportUrl(): string {
  const appUrl = getServerEnv().APP_URL;
  return appUrl ? `${appUrl}/app/executive-report` : "";
}

async function composeForPilotTenant(now: Date): Promise<{ tenantId: string; businessDate: string; message: string } | null> {
  const pilotTenant = await resolvePilotTenant();
  if (!pilotTenant) return null;

  const businessDate = getJakartaBusinessDate(now);
  const summary = await getExecutiveReportSummaryForTenant(pilotTenant.tenantId);
  const message = composeMorningBrief({ businessDate, summary, executiveReportUrl: executiveReportUrl() });

  return { tenantId: pilotTenant.tenantId, businessDate, message };
}

export type MorningBriefPreviewResult =
  | { status: "ok"; businessDate: string; message: string }
  | { status: "pilot_tenant_unavailable" };

// dryRun path — reads only, never touches notification_events. Safe to call
// any number of times; never counts against the once-per-business_date
// dedup.
export async function previewMorningBrief(now: Date = new Date()): Promise<MorningBriefPreviewResult> {
  const composed = await composeForPilotTenant(now);
  if (!composed) return { status: "pilot_tenant_unavailable" };

  return { status: "ok", businessDate: composed.businessDate, message: composed.message };
}

export type MorningBriefDeliveryResult =
  | { status: "claimed"; businessDate: string; event: { id: string; message: string } }
  | { status: "duplicate"; businessDate: string }
  | { status: "pilot_tenant_unavailable" };

// Real (non-dryRun) path — composes, then enqueues+claims via the
// once-per-tenant-per-business_date RPC. workerId/leaseSeconds come from
// the caller (n8n's execution id), never generated here, so a genuine retry
// with the same workerId is observable as the same claim.
export async function composeAndEnqueueMorningBrief(input: {
  workerId: string;
  leaseSeconds?: number;
  now?: Date;
}): Promise<MorningBriefDeliveryResult> {
  const composed = await composeForPilotTenant(input.now ?? new Date());
  if (!composed) return { status: "pilot_tenant_unavailable" };

  const { row, claimedByThisCall } = await enqueueAndClaimMorningBriefDelivery({
    tenantId: composed.tenantId,
    businessDate: composed.businessDate,
    workerId: input.workerId,
    leaseSeconds: input.leaseSeconds,
    messageLine1: composed.message,
  });

  if (!claimedByThisCall) {
    return { status: "duplicate", businessDate: composed.businessDate };
  }

  return {
    status: "claimed",
    businessDate: composed.businessDate,
    event: { id: row.id, message: composed.message },
  };
}
