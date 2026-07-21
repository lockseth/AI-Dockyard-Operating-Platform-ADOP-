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
