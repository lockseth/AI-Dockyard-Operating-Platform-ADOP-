import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapMasterDataError } from "../shared/errors";
import type { RecordStatus } from "../shared/types";
import type { MasterDataActionResult } from "../clients/service";
import {
  getExpenseCategoryById,
  insertExpenseCategory,
  listExpenseCategories,
  updateExpenseCategoryRow,
  type ExpenseCategoryRow,
} from "./repository";
import type { CreateExpenseCategoryInput, UpdateExpenseCategoryInput } from "./validation";

export interface CreateExpenseCategoryResult extends MasterDataActionResult {
  id?: string;
}

export async function listExpenseCategoriesForActiveTenant(search?: string): Promise<ExpenseCategoryRow[]> {
  const context = await requireTenantContext();
  return listExpenseCategories(context.tenantId, search);
}

export async function createExpenseCategory(
  input: CreateExpenseCategoryInput,
): Promise<CreateExpenseCategoryResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  if (input.parentId) {
    const parent = await getExpenseCategoryById(context.tenantId, input.parentId);
    if (!parent) {
      return { error: "Kategori induk tidak ditemukan." };
    }
  }

  const { data, error } = await insertExpenseCategory({
    tenant_id: context.tenantId,
    parent_id: input.parentId ?? null,
    code: input.code,
    name: input.name,
    description: input.description ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return { id: data.id };
}

export async function updateExpenseCategory(
  id: string,
  input: UpdateExpenseCategoryInput,
): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getExpenseCategoryById(context.tenantId, id);
  if (!before) {
    return { error: "Kategori tidak ditemukan." };
  }

  const { data, error } = await updateExpenseCategoryRow(context.tenantId, id, {
    code: input.code,
    name: input.name,
    description: input.description ?? null,
  });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}

export async function setExpenseCategoryStatus(id: string, status: RecordStatus): Promise<MasterDataActionResult> {
  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const before = await getExpenseCategoryById(context.tenantId, id);
  if (!before) {
    return { error: "Kategori tidak ditemukan." };
  }
  if (before.status === status) {
    return {};
  }

  const { data, error } = await updateExpenseCategoryRow(context.tenantId, id, { status });

  if (error || !data) {
    return { error: mapMasterDataError(error) };
  }

  return {};
}
