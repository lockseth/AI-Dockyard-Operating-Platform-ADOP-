import type { Tables } from "@/types/database";

export type NotificationEventRow = Tables<"notification_events">;

// Shape stored in notification_events.payload by the enqueueing RPCs
// (see 20260721000000_owner_control_notification_outbox.sql §8a/§8b).
// link_path is present only for event types that carry a review link.
export interface NotificationEventPayload {
  message_line1: string;
  link_path?: string;
}

export interface ClaimedNotification {
  id: string;
  message: string;
  // Server-resolved (see resolveVerifiedOwnerRecipient in ./repository) —
  // never supplied by n8n and never a literal fallback. A claim that cannot
  // resolve exactly one verified owner recipient never reaches this shape
  // (see claimNextNotificationForDelivery in ./service).
  recipient: string;
}
