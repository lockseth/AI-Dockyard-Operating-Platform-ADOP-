import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationEventRow } from "./types";

// Service-role only, by design — these three RPCs are granted execute to
// service_role alone (see the migration), never to `authenticated`. This
// repository is the ONLY caller in the codebase; it must never be imported
// from a page/Server Action that runs as the signed-in user's own client
// (enforced by src/lib/notification-outbox/no-authenticated-client-exposure.test.ts).

export async function claimNextNotificationEvent(
  workerId: string,
  leaseSeconds?: number,
): Promise<NotificationEventRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("claim_next_notification_event", {
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  // A SQL-level NULL composite return comes back over PostgREST as an
  // object with every field set to null (not a bare JSON null) — `data.id`
  // is the reliable "nothing was claimable" signal, not `data` itself.
  return data?.id ? data : null;
}

export async function completeNotificationEvent(params: {
  eventId: string;
  workerId: string;
  providerMessageId?: string;
}): Promise<NotificationEventRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("complete_notification_event", {
    p_event_id: params.eventId,
    p_worker_id: params.workerId,
    p_provider_message_id: params.providerMessageId,
  });
  if (error) throw error;
  return data;
}

export async function failNotificationEvent(params: {
  eventId: string;
  workerId: string;
  error: string;
}): Promise<NotificationEventRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("fail_notification_event", {
    p_event_id: params.eventId,
    p_worker_id: params.workerId,
    p_error: params.error,
  });
  if (error) throw error;
  return data;
}

// Gate 6J-E1 — Morning Brief. Unlike the three RPCs above (which only ever
// touch a row some other domain RPC already enqueued), this one both
// enqueues (idempotent per tenant+business_date) and claims in the same
// call, since Morning Brief has no separate domain transaction to piggyback
// an enqueue onto — see 20260731000000_morning_brief_notification_outbox_
// extension.sql. Whether THIS call is the one that (re)claimed the row is
// the caller's responsibility to check (compare the returned claimed_by to
// the worker id it just sent) — the RPC always returns the current row,
// claimed or not.
export async function enqueueAndClaimMorningBriefNotification(params: {
  tenantId: string;
  businessDate: string;
  workerId: string;
  messageLine1: string;
  linkPath?: string;
  leaseSeconds?: number;
}): Promise<NotificationEventRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("enqueue_and_claim_morning_brief_notification", {
    p_tenant_id: params.tenantId,
    p_business_date: params.businessDate,
    p_worker_id: params.workerId,
    p_message_line1: params.messageLine1,
    p_link_path: params.linkPath,
    p_lease_seconds: params.leaseSeconds,
  });
  if (error) throw error;
  return data;
}
