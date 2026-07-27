import type { Tone } from "@/components/ui/tone";
import type { InvoiceDeliveryEventChannel, InvoiceDeliveryEventType } from "./types";

export const DELIVERY_CHANNEL_LABEL: Record<InvoiceDeliveryEventChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  manual: "Manual/Langsung",
};

export const DELIVERY_EVENT_TYPE_LABEL: Record<InvoiceDeliveryEventType, string> = {
  sent: "Terkirim",
  delivered: "Delivered",
  acknowledged: "Diterima (Diakui)",
  failed: "Gagal",
};

export const DELIVERY_EVENT_TYPE_TONE: Record<InvoiceDeliveryEventType, Tone> = {
  sent: "info",
  delivered: "info",
  acknowledged: "success",
  failed: "danger",
};
