import "server-only";
import { getServerEnv } from "@/lib/env/server";
import { claimNextNotificationEvent, completeNotificationEvent, failNotificationEvent } from "./repository";
import type { ClaimedNotification, NotificationEventPayload } from "./types";

export class NotificationClaimMismatchError extends Error {
  constructor() {
    super("Notification event is not claimed by this worker.");
    this.name = "NotificationClaimMismatchError";
  }
}

// supabase-js surfaces a PL/pgSQL RAISE EXCEPTION as a PostgrestError — a
// plain object shaped like { code, details, hint, message }, NOT a real
// Error instance — so `error instanceof Error` never matches it. Checking
// for a string `message` property works for both that shape and a genuine
// Error/thrown string.
function isClaimMismatch(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.includes("NOTIFICATION_CLAIM_MISMATCH");
}

// The only place the WhatsApp text is assembled — from the trusted payload
// the enqueueing RPC wrote (fixed sentence, server-derived link path only;
// never a client-suppliable amount or free text). APP_URL is server-only
// env, so this composition can only happen here, not in the database.
export async function claimNextNotificationForDelivery(input: {
  workerId: string;
  leaseSeconds?: number;
}): Promise<ClaimedNotification | null> {
  const row = await claimNextNotificationEvent(input.workerId, input.leaseSeconds);
  if (!row) {
    return null;
  }

  const payload = row.payload as unknown as NotificationEventPayload;
  const env = getServerEnv();
  const linkLine = payload.link_path ? `\n\n[Buka Review Transaksi] ${env.APP_URL}${payload.link_path}` : "";

  return { id: row.id, message: `${payload.message_line1}${linkLine}` };
}

export async function completeNotificationDelivery(input: {
  id: string;
  workerId: string;
  providerMessageId?: string;
}): Promise<{ status: string }> {
  try {
    const row = await completeNotificationEvent({
      eventId: input.id,
      workerId: input.workerId,
      providerMessageId: input.providerMessageId,
    });
    return { status: row.status };
  } catch (error) {
    if (isClaimMismatch(error)) {
      throw new NotificationClaimMismatchError();
    }
    throw error;
  }
}

export async function failNotificationDelivery(input: {
  id: string;
  workerId: string;
  error: string;
}): Promise<{ status: string }> {
  try {
    const row = await failNotificationEvent({ eventId: input.id, workerId: input.workerId, error: input.error });
    return { status: row.status };
  } catch (error) {
    if (isClaimMismatch(error)) {
      throw new NotificationClaimMismatchError();
    }
    throw error;
  }
}
