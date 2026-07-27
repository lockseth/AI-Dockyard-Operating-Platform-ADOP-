import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapInvoiceDeliveryError } from "./errors";
import { listInvoiceDeliveryEvents, recordInvoiceDeliveryEvent } from "./repository";
import type { InvoiceDeliveryEventRow } from "./types";
import {
  listInvoiceDeliveryEventsInputSchema,
  recordInvoiceAcknowledgmentInputSchema,
  recordInvoiceDeliveryInputSchema,
} from "./validation";

export interface InvoiceDeliveryActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// Same owner/admin gate as invoice/evidence access (Gate 4A Contract §7
// precedent) — delivery/acknowledgment events are financial-sensitive
// invoice data, not master-data-style read-only content.
export async function listInvoiceDeliveryEventsForActiveTenant(rawInput: unknown): Promise<InvoiceDeliveryEventRow[]> {
  const parsed = listInvoiceDeliveryEventsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return [];
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);
  return listInvoiceDeliveryEvents(context.tenantId, parsed.data.invoiceId);
}

export async function recordInvoiceDeliveryForActiveTenant(rawInput: unknown): Promise<InvoiceDeliveryActionResult> {
  const parsed = recordInvoiceDeliveryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await recordInvoiceDeliveryEvent({
    invoiceId: parsed.data.invoiceId,
    channel: parsed.data.channel,
    eventType: parsed.data.eventType,
    recipientSnapshot: parsed.data.recipientSnapshot,
    failureReason: parsed.data.failureReason ?? null,
  });
  if (error) {
    return { error: mapInvoiceDeliveryError(error) };
  }
  return {};
}

export async function recordInvoiceAcknowledgmentForActiveTenant(rawInput: unknown): Promise<InvoiceDeliveryActionResult> {
  const parsed = recordInvoiceAcknowledgmentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { error } = await recordInvoiceDeliveryEvent({
    invoiceId: parsed.data.invoiceId,
    channel: parsed.data.channel,
    eventType: "acknowledged",
    recipientSnapshot: parsed.data.recipientSnapshot,
    acknowledgmentNote: parsed.data.acknowledgmentNote ?? null,
  });
  if (error) {
    return { error: mapInvoiceDeliveryError(error) };
  }
  return {};
}
