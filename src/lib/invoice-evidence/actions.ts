"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  bindInvoiceTransactionForActiveTenant,
  createDraftInvoiceForActiveTenant,
  finalizeInvoiceEvidenceVersionForActiveTenant,
  getInvoiceEvidenceSignedUrlForActiveTenant,
  issueInvoiceForActiveTenant,
  reissueInvoiceForActiveTenant,
  rejectInvoiceEvidenceVersionForActiveTenant,
  unbindInvoiceTransactionForActiveTenant,
  verifyInvoiceEvidenceVersionForActiveTenant,
  voidInvoiceForActiveTenant,
  type CreateDraftInvoiceResult,
  type FinalizeEvidenceResult,
  type InvoiceEvidenceActionResult,
  type ReissueInvoiceResult,
  type SignedUrlResult,
} from "./service";
import { EVIDENCE_SIGNED_URL_TTL_SECONDS } from "./types";

// Mirrors cost-ledger/actions.ts's mapThrown convention — tenant_id/actor
// are always re-derived server-side inside service.ts and the underlying
// RPCs, never read from formData.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function createDraftInvoiceAction(
  _prevState: CreateDraftInvoiceResult,
  _formData: FormData,
): Promise<CreateDraftInvoiceResult> {
  let result: CreateDraftInvoiceResult;
  try {
    result = await createDraftInvoiceForActiveTenant();
  } catch (error) {
    return mapThrown(error);
  }
  if (result.invoiceId) {
    revalidatePath("/billing/invoices");
    redirect(`/billing/invoices/${result.invoiceId}`);
  }
  return result;
}

export async function bindInvoiceTransactionAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await bindInvoiceTransactionForActiveTenant({
      invoiceId,
      transactionEntryId: formData.get("transactionEntryId"),
    });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}

export async function unbindInvoiceTransactionAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await unbindInvoiceTransactionForActiveTenant({ lineId: formData.get("lineId") });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}

export async function issueInvoiceAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await issueInvoiceForActiveTenant({ invoiceId });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
    revalidatePath("/billing/invoices");
  }
  return result;
}

export async function voidInvoiceAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await voidInvoiceForActiveTenant({ invoiceId, reason: formData.get("reason") });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
    revalidatePath("/billing/invoices");
  }
  return result;
}

export async function reissueInvoiceAction(
  _prevState: ReissueInvoiceResult,
  formData: FormData,
): Promise<ReissueInvoiceResult> {
  let result: ReissueInvoiceResult;
  try {
    result = await reissueInvoiceForActiveTenant({ predecessorInvoiceId: formData.get("predecessorInvoiceId") });
  } catch (error) {
    return mapThrown(error);
  }
  if (result.invoiceId) {
    revalidatePath("/billing/invoices");
    redirect(`/billing/invoices/${result.invoiceId}`);
  }
  return result;
}

// Called imperatively from EvidenceUploadForm right after the browser
// finishes uploading the object straight to Supabase Storage — not bound to
// a <form action>, since the file itself never passes through this action
// (only its already-computed hash/size/mime + storage_path do).
export async function finalizeInvoiceEvidenceVersionAction(input: {
  invoiceId: string;
  storagePath: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}): Promise<FinalizeEvidenceResult> {
  let result: FinalizeEvidenceResult;
  try {
    result = await finalizeInvoiceEvidenceVersionForActiveTenant(input);
  } catch (error) {
    return mapThrown(error);
  }
  if (result.versionId) {
    revalidatePath(`/billing/invoices/${input.invoiceId}`);
  }
  return result;
}

export async function verifyInvoiceEvidenceVersionAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await verifyInvoiceEvidenceVersionForActiveTenant({ versionId: formData.get("versionId") });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}

export async function rejectInvoiceEvidenceVersionAction(
  _prevState: InvoiceEvidenceActionResult,
  formData: FormData,
): Promise<InvoiceEvidenceActionResult> {
  const invoiceId = formData.get("invoiceId");
  let result: InvoiceEvidenceActionResult;
  try {
    result = await rejectInvoiceEvidenceVersionForActiveTenant({
      versionId: formData.get("versionId"),
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }
  if (!result.error && !result.fieldErrors && typeof invoiceId === "string") {
    revalidatePath(`/billing/invoices/${invoiceId}`);
  }
  return result;
}

// Called imperatively (onClick), not via a <form> — it returns a one-time
// URL for the caller to open, not a mutation whose success is a redirect.
export async function getInvoiceEvidenceSignedUrlAction(versionId: string): Promise<SignedUrlResult> {
  try {
    return await getInvoiceEvidenceSignedUrlForActiveTenant({ versionId }, EVIDENCE_SIGNED_URL_TTL_SECONDS);
  } catch (error) {
    return mapThrown(error);
  }
}
