import { z } from "zod";
import { idSchema, requiredText } from "@/lib/master-data/shared/validation";

export const reversePairedProjectRefundInputSchema = z.object({
  cashEntryId: idSchema,
  costEntryId: idSchema,
  reason: requiredText(500, "Alasan reversal wajib diisi."),
});
export type ReversePairedProjectRefundInput = z.infer<typeof reversePairedProjectRefundInputSchema>;
