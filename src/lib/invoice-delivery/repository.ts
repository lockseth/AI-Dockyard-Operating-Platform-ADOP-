import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InvoiceDeliveryEventChannel, InvoiceDeliveryEventRow, InvoiceDeliveryEventType } from "./types";

export async function listInvoiceDeliveryEvents(tenantId: string, invoiceId: string): Promise<InvoiceDeliveryEventRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_delivery_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Lean single-row read for callers that only need the most recent event per
// invoice (e.g. the executive report's attention derivation) rather than the
// full history listInvoiceDeliveryEvents returns. event_seq is the
// authoritative per-invoice ordering column — created_at is not used since
// two events can share a created_at at insert granularity.
export async function getLatestInvoiceDeliveryEvent(
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceDeliveryEventRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invoice_delivery_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("invoice_id", invoiceId)
    .order("event_seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function recordInvoiceDeliveryEvent(params: {
  invoiceId: string;
  channel: InvoiceDeliveryEventChannel;
  eventType: InvoiceDeliveryEventType;
  recipientSnapshot: string;
  providerReference?: string | null;
  failureReason?: string | null;
  acknowledgmentNote?: string | null;
}) {
  const supabase = await createSupabaseServerClient();
  return supabase.rpc("record_invoice_delivery_event", {
    p_invoice_id: params.invoiceId,
    p_channel: params.channel,
    p_event_type: params.eventType,
    p_recipient_snapshot: params.recipientSnapshot,
    p_provider_reference: params.providerReference ?? undefined,
    p_failure_reason: params.failureReason ?? undefined,
    p_acknowledgment_note: params.acknowledgmentNote ?? undefined,
  });
}
