import "server-only";
import { getServerEnv } from "@/lib/env/server";
import {
  claimNextNotificationEvent,
  completeNotificationEvent,
  enqueueAndClaimMorningBriefNotification,
  failNotificationEvent,
} from "./repository";
import type { ClaimedNotification, NotificationEventPayload, NotificationEventRow } from "./types";

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

export interface MorningBriefClaimResult {
  row: NotificationEventRow;
  claimedByThisCall: boolean;
}

// Gate 6J-E1. enqueue_and_claim_morning_brief_notification always returns
// the CURRENT row for (tenant, businessDate) — whether this call is the one
// that just (re)claimed it, or a duplicate call that found it already
// claimed/sent/failed, has to be derived by the caller. That derivation
// lives here once, so both the internal route and any future caller share
// the exact same "is this a duplicate" rule instead of re-deriving it.
export async function enqueueAndClaimMorningBriefDelivery(input: {
  tenantId: string;
  businessDate: string;
  workerId: string;
  messageLine1: string;
  linkPath?: string;
  leaseSeconds?: number;
}): Promise<MorningBriefClaimResult> {
  const row = await enqueueAndClaimMorningBriefNotification(input);
  return {
    row,
    claimedByThisCall: row.status === "processing" && row.claimed_by === input.workerId,
  };
}
