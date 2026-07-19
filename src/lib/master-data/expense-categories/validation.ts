import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText, recordStatusSchema, requiredText } from "../shared/validation";

const categoryFieldsSchema = z.object({
  code: requiredText(50, "Kode wajib diisi."),
  name: requiredText(200, "Nama wajib diisi."),
  description: optionalText(500),
});

export const createExpenseCategoryInputSchema = categoryFieldsSchema.extend({
  parentId: z.preprocess(emptyToUndefined, idSchema.optional()),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategoryInputSchema>;

export const updateExpenseCategoryInputSchema = categoryFieldsSchema;
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategoryInputSchema>;

export const expenseCategoryStatusInputSchema = z.object({
  id: idSchema,
  status: recordStatusSchema,
});

export function parseCreateExpenseCategoryFormData(formData: FormData) {
  return createExpenseCategoryInputSchema.safeParse({
    parentId: formData.get("parentId"),
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
}

export function parseUpdateExpenseCategoryFormData(formData: FormData) {
  return updateExpenseCategoryInputSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
}
