"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import {
  approveAndCommitCashImportBatchForActiveTenant,
  markCashImportBatchReadyForReviewForActiveTenant,
  rejectCashImportBatchForActiveTenant,
  setCashImportLabelMappingForActiveTenant,
  setCashImportRowDispositionForActiveTenant,
  uploadCashReportForActiveTenant,
  type CashImportStagingActionResult,
  type UploadCashImportResult,
} from "./service";

// Every action below forwards only the fields a client legitimately
// supplies; tenantId/actor/status are re-derived server-side inside
// service.ts and the RPC itself, never read from formData. Mirrors
// src/lib/owner-control/actions.ts's mapThrown/revalidatePath convention.
function mapThrown<T extends { error?: string }>(error: unknown): T {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." } as T;
  }
  throw error;
}

export async function uploadCashReportStagingAction(
  _prevState: UploadCashImportResult,
  formData: FormData,
): Promise<UploadCashImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "File wajib diunggah." };
  }

  let result: UploadCashImportResult;
  try {
    result = await uploadCashReportForActiveTenant(file);
  } catch (error) {
    return mapThrown(error);
  }

  // "File ini sudah pernah dianalisis. Membuka batch yang sudah ada." is
  // rendered on the batch detail page itself, driven by the ?reopened=1
  // query param — redirect() throws internally and is expected to escape
  // this action (outside the try/catch above), which useActionState
  // supports natively.
  if (result.batchId) {
    redirect(`/operations/import/${result.batchId}${result.isNew ? "" : "?reopened=1"}`);
  }

  return result;
}

export async function setCashImportLabelMappingAction(
  _prevState: CashImportStagingActionResult,
  formData: FormData,
): Promise<CashImportStagingActionResult> {
  const batchId = formData.get("batchId");
  let result: CashImportStagingActionResult;
  try {
    result = await setCashImportLabelMappingForActiveTenant({
      batchId,
      vesselLabel: formData.get("vesselLabel"),
      mappingKind: formData.get("mappingKind"),
      mappedVesselProjectId: formData.get("mappedVesselProjectId"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors && typeof batchId === "string") {
    revalidatePath(`/operations/import/${batchId}`);
  }
  return result;
}

export async function setCashImportRowDispositionAction(
  _prevState: CashImportStagingActionResult,
  formData: FormData,
): Promise<CashImportStagingActionResult> {
  const batchId = formData.get("batchId");
  let result: CashImportStagingActionResult;
  try {
    result = await setCashImportRowDispositionForActiveTenant({
      rowId: formData.get("rowId"),
      disposition: formData.get("disposition"),
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors && typeof batchId === "string") {
    revalidatePath(`/operations/import/${batchId}`);
  }
  return result;
}

export async function approveAndCommitCashImportBatchAction(
  _prevState: CashImportStagingActionResult,
  formData: FormData,
): Promise<CashImportStagingActionResult> {
  const batchId = formData.get("batchId");
  let result: CashImportStagingActionResult;
  try {
    result = await approveAndCommitCashImportBatchForActiveTenant({ batchId });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors && typeof batchId === "string") {
    revalidatePath(`/operations/import/${batchId}`);
    revalidatePath("/owner/control");
    revalidatePath("/operations/daily");
  }
  return result;
}

export async function rejectCashImportBatchAction(
  _prevState: CashImportStagingActionResult,
  formData: FormData,
): Promise<CashImportStagingActionResult> {
  const batchId = formData.get("batchId");
  let result: CashImportStagingActionResult;
  try {
    result = await rejectCashImportBatchForActiveTenant({
      batchId,
      reason: formData.get("reason"),
    });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors && typeof batchId === "string") {
    revalidatePath(`/operations/import/${batchId}`);
    revalidatePath("/owner/control");
  }
  return result;
}

export async function markCashImportBatchReadyForReviewAction(
  _prevState: CashImportStagingActionResult,
  formData: FormData,
): Promise<CashImportStagingActionResult> {
  const batchId = formData.get("batchId");
  let result: CashImportStagingActionResult;
  try {
    result = await markCashImportBatchReadyForReviewForActiveTenant({ batchId });
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error && !result.fieldErrors && typeof batchId === "string") {
    revalidatePath(`/operations/import/${batchId}`);
  }
  return result;
}
