"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  recordInvoiceAcknowledgmentForActiveTenant,
  recordInvoiceDeliveryForActiveTenant,
  type InvoiceDeliveryActionResult,
} from "./service";

// Mirrors invoice-evidence/actions.ts's mapThrown convention — tenant_id/
// actor are always re-derived server-side inside service.ts and the
// underlying RPC, never read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function recordInvoiceDeliveryAction(
  _prevState: InvoiceDeliveryActionResult,
  formData: FormData,
): Promise<InvoiceDeliveryActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceDeliveryActionResult;
  try {
    result = await recordInvoiceDeliveryForActiveTenant({
      invoiceId,
      channel: formData.get("channel"),
      eventType: formData.get("eventType"),
      recipientSnapshot: formData.get("recipientSnapshot"),
      providerReference: formData.get("providerReference"),
      failureReason: formData.get("failureReason"),
    });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}

export async function recordInvoiceAcknowledgmentAction(
  _prevState: InvoiceDeliveryActionResult,
  formData: FormData,
): Promise<InvoiceDeliveryActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceDeliveryActionResult;
  try {
    result = await recordInvoiceAcknowledgmentForActiveTenant({
      invoiceId,
      channel: formData.get("channel"),
      recipientSnapshot: formData.get("recipientSnapshot"),
      acknowledgmentNote: formData.get("acknowledgmentNote"),
    });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}
