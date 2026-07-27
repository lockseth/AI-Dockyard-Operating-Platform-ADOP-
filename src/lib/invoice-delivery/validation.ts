import { z } from "zod";
import { idSchema, optionalText, requiredText } from "@/lib/master-data/shared/validation";
import { INVOICE_DELIVERY_EVENT_CHANNELS, INVOICE_DELIVERY_SEND_EVENT_TYPES } from "./types";

// "Catat Pengiriman" — admin manually logs what happened on a channel
// (sent/delivered/failed); `acknowledged` is never selectable here.
export const recordInvoiceDeliveryInputSchema = z
  .object({
    invoiceId: idSchema,
    channel: z.enum(INVOICE_DELIVERY_EVENT_CHANNELS, { message: "Kanal pengiriman wajib dipilih." }),
    eventType: z.enum(INVOICE_DELIVERY_SEND_EVENT_TYPES, { message: "Status pengiriman wajib dipilih." }),
    recipientSnapshot: requiredText(300, "Penerima wajib diisi."),
    providerReference: optionalText(200),
    failureReason: optionalText(500),
  })
  .refine((data) => data.eventType !== "failed" || (data.failureReason?.trim().length ?? 0) > 0, {
    message: "Alasan gagal wajib diisi untuk status gagal.",
    path: ["failureReason"],
  })
  .refine((data) => data.eventType === "failed" || !data.failureReason, {
    message: "Alasan gagal hanya berlaku untuk status gagal.",
    path: ["failureReason"],
  });
export type RecordInvoiceDeliveryInput = z.infer<typeof recordInvoiceDeliveryInputSchema>;

// "Catat Diterima" — always writes an `acknowledged` event; eventType is
// never a user-supplied field here.
export const recordInvoiceAcknowledgmentInputSchema = z.object({
  invoiceId: idSchema,
  channel: z.enum(INVOICE_DELIVERY_EVENT_CHANNELS, { message: "Kanal wajib dipilih." }),
  recipientSnapshot: requiredText(300, "Penerima wajib diisi."),
  acknowledgmentNote: optionalText(500),
});
export type RecordInvoiceAcknowledgmentInput = z.infer<typeof recordInvoiceAcknowledgmentInputSchema>;

export const listInvoiceDeliveryEventsInputSchema = z.object({
  invoiceId: idSchema,
});
export type ListInvoiceDeliveryEventsInput = z.infer<typeof listInvoiceDeliveryEventsInputSchema>;
