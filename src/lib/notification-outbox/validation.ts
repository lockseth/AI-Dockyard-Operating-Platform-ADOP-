import { z } from "zod";

// Deliberately minimal payloads — no tenantId/actor/userId field exists on
// any of these schemas, so a caller who already has the shared secret still
// has no way to assert an identity or tenant; every RPC these feed derives
// tenant/actor from server-held state, never from the request body.

export const claimNotificationRequestSchema = z.object({
  workerId: z.string().trim().min(1).max(200),
  leaseSeconds: z.number().int().min(30).max(3600).optional(),
});

export const completeNotificationRequestSchema = z.object({
  id: z.string().uuid(),
  workerId: z.string().trim().min(1).max(200),
  providerMessageId: z.string().trim().min(1).max(500).optional(),
});

export const failNotificationRequestSchema = z.object({
  id: z.string().uuid(),
  workerId: z.string().trim().min(1).max(200),
  error: z.string().trim().min(1).max(2000),
});
