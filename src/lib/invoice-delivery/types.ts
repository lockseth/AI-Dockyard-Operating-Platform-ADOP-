import type { Enums, Tables } from "@/types/database";

export type InvoiceDeliveryEventRow = Tables<"invoice_delivery_events">;

export type InvoiceDeliveryEventChannel = Enums<"invoice_delivery_event_channel">;
export type InvoiceDeliveryEventType = Enums<"invoice_delivery_event_type">;

export const INVOICE_DELIVERY_EVENT_CHANNELS: readonly InvoiceDeliveryEventChannel[] = ["email", "whatsapp", "manual"];

// "Catat Pengiriman" records one of these — never `acknowledged`, which is
// only ever written by the dedicated "Catat Diterima" action.
export const INVOICE_DELIVERY_SEND_EVENT_TYPES: readonly Extract<InvoiceDeliveryEventType, "sent" | "delivered" | "failed">[] = [
  "sent",
  "delivered",
  "failed",
];
