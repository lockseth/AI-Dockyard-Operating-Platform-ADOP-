import { z } from "zod";
import { emptyToUndefined, idSchema, optionalText } from "@/lib/master-data/shared/validation";
import {
  TRANSACTION_DIRECTIONS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "./types";

const optionalId = z.preprocess(emptyToUndefined, idSchema.optional());
const optionalDate = z.preprocess(emptyToUndefined, z.string().date().optional());
const optionalCursor = z.preprocess(emptyToUndefined, z.string().max(500).optional());

const trustedTransactionFiltersSchema = z.object({
  dateFrom: optionalDate,
  dateTo: optionalDate,
  projectId: optionalId,
  transactionType: z.preprocess(emptyToUndefined, z.enum(TRANSACTION_TYPES).optional()),
  transactionDirection: z.preprocess(emptyToUndefined, z.enum(TRANSACTION_DIRECTIONS).optional()),
  source: z.preprocess(emptyToUndefined, z.enum(TRANSACTION_SOURCES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(TRANSACTION_STATUSES).optional()),
  importBatchId: optionalId,
  search: z.preprocess(emptyToUndefined, optionalText(200)),
});

function withDateRangeCheck<T extends { dateFrom?: string; dateTo?: string }>(schema: z.ZodType<T>) {
  return schema.refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir.",
    path: ["dateTo"],
  });
}

export const listTrustedTransactionsInputSchema = withDateRangeCheck(
  trustedTransactionFiltersSchema.extend({
    cursor: optionalCursor,
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
);
export type ListTrustedTransactionsInput = z.infer<typeof listTrustedTransactionsInputSchema>;

export const summarizeTrustedTransactionsInputSchema = withDateRangeCheck(trustedTransactionFiltersSchema);
export type SummarizeTrustedTransactionsInput = z.infer<typeof summarizeTrustedTransactionsInputSchema>;

export const getTrustedTransactionDetailInputSchema = z.object({
  logicalTransactionId: z.string().trim().min(1).max(300),
});
export type GetTrustedTransactionDetailInput = z.infer<typeof getTrustedTransactionDetailInputSchema>;
