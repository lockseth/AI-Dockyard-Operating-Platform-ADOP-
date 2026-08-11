"use server";

import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { registerOwnerWhatsappNumberForActiveTenant } from "./service";
import type { AssistantIdentityActionResult } from "./service";
import type { RegisterOwnerWhatsappResult } from "./types";

const SETTINGS_PERSONAL_PATH = "/app/settings/personal";

// Gate 1L-R4A: the only server action this module currently needs — the
// Settings/Personal form has exactly one mutation ("Simpan Nomor
// WhatsApp"), no separate revoke/delete control (task LOCK: form has only
// the number field, one save button, and a status readout).
export async function registerOwnerWhatsappNumberAction(
  _prevState: AssistantIdentityActionResult<RegisterOwnerWhatsappResult>,
  formData: FormData,
): Promise<AssistantIdentityActionResult<RegisterOwnerWhatsappResult>> {
  let result: AssistantIdentityActionResult<RegisterOwnerWhatsappResult>;
  try {
    result = await registerOwnerWhatsappNumberForActiveTenant({
      rawNumber: formData.get("rawNumber"),
    });
  } catch (error) {
    if (error instanceof UnauthorizedTenantRoleError) {
      return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
    }
    return { error: "Gagal menyimpan nomor WhatsApp. Silakan coba lagi." };
  }

  if (!result.error && !result.fieldErrors) {
    revalidatePath(SETTINGS_PERSONAL_PATH);
  }
  return result;
}
