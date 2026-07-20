"use server";

import "server-only";
import { requireTenantContext } from "@/lib/auth/tenant";
import { canAccessCashImport } from "./access";
import { parseCashReportWorkbook } from "./parser";
import type { CashImportActionResult } from "./types";

// Dry-run only: reads the uploaded workbook into memory, parses it, and
// returns the preview. Nothing here writes to Supabase — no client is even
// constructed beyond the tenant/role check — and the buffer is discarded
// once this call returns (never written to disk or storage).
export async function analyzeCashReportUploadAction(
  _prevState: CashImportActionResult | null,
  formData: FormData,
): Promise<CashImportActionResult> {
  const context = await requireTenantContext();
  if (!canAccessCashImport(context.roles)) {
    return { ok: false, forbidden: true };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, fileError: { code: "WRONG_FORMAT", message: "File wajib diunggah." } };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return parseCashReportWorkbook(buffer, file.name);
}
