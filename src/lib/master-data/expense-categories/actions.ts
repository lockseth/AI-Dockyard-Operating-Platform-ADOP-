"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { UnauthorizedTenantRoleError } from "@/lib/auth/tenant";
import { idSchema, recordStatusSchema } from "../shared/validation";
import type { MasterDataActionResult } from "../clients/service";
import { createExpenseCategory, setExpenseCategoryStatus, updateExpenseCategory } from "./service";
import { parseCreateExpenseCategoryFormData, parseUpdateExpenseCategoryFormData } from "./validation";

const EXPENSE_CATEGORIES_PATH = "/app/master-data/expense-categories";

function mapThrown(error: unknown): MasterDataActionResult {
  if (error instanceof UnauthorizedTenantRoleError) {
    return { error: "Anda tidak memiliki izin untuk melakukan aksi ini." };
  }
  return { error: "Gagal menyimpan data. Silakan coba lagi." };
}

export async function createExpenseCategoryAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const parsed = parseCreateExpenseCategoryFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result;
  try {
    result = await createExpenseCategory(parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (result.error) {
    return result;
  }

  revalidatePath(EXPENSE_CATEGORIES_PATH);
  redirect(EXPENSE_CATEGORIES_PATH);
}

export async function updateExpenseCategoryAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  if (!idParsed.success) {
    return { error: "Kategori tidak valid." };
  }

  const parsed = parseUpdateExpenseCategoryFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: MasterDataActionResult;
  try {
    result = await updateExpenseCategory(idParsed.data, parsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  if (!result.error) {
    revalidatePath(EXPENSE_CATEGORIES_PATH);
  }
  return result;
}

export async function setExpenseCategoryStatusAction(
  _prevState: MasterDataActionResult,
  formData: FormData,
): Promise<MasterDataActionResult> {
  const idParsed = idSchema.safeParse(formData.get("id"));
  const statusParsed = recordStatusSchema.safeParse(formData.get("status"));
  if (!idParsed.success || !statusParsed.success) {
    return { error: "Permintaan tidak valid." };
  }

  let result: MasterDataActionResult;
  try {
    result = await setExpenseCategoryStatus(idParsed.data, statusParsed.data);
  } catch (error) {
    return mapThrown(error);
  }

  revalidatePath(EXPENSE_CATEGORIES_PATH);
  return result;
}
