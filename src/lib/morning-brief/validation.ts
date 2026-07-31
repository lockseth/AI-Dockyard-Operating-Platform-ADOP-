import { z } from "zod";

// No tenantId field, same posture as notification-outbox/validation.ts — the
// pilot tenant is resolved server-side from MORNING_BRIEF_PILOT_TENANT_SLUG,
// never accepted from the request body.
export const morningBriefRequestSchema = z.object({
  workerId: z.string().trim().min(1).max(200),
  leaseSeconds: z.number().int().min(30).max(3600).optional(),
  dryRun: z.boolean().optional(),
});
