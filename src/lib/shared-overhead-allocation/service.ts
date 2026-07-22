import "server-only";
import { requireTenantContext, requireTenantRole } from "@/lib/auth/tenant";
import { mapSharedOverheadAllocationError } from "./errors";
import {
  allocateSharedOverheadEntry,
  listSharedOverheadAllocationsForEntry,
  listSharedOverheadAllocationsForProject,
  listSharedOverheadAllocationsForTenant,
  listSharedOverheadAllocationStatusForTenant,
  reverseSharedOverheadAllocation,
  type SharedOverheadAllocationCurrentRow,
  type SharedOverheadAllocationRow,
  type SharedOverheadAllocationStatusRow,
} from "./repository";
import { allocateSharedOverheadEntryInputSchema, reverseSharedOverheadAllocationInputSchema } from "./validation";

export interface SharedOverheadAllocationActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  allocation?: SharedOverheadAllocationRow;
}

// RLS is the final enforcement layer for visibility (every active tenant
// member, including viewer, can read) — no additional role check needed
// here, matching the list functions in expense-approvals/service.ts.
export async function listSharedOverheadAllocationStatusForActiveTenant(): Promise<SharedOverheadAllocationStatusRow[]> {
  const context = await requireTenantContext();
  return listSharedOverheadAllocationStatusForTenant(context.tenantId);
}

export async function listSharedOverheadAllocationsForActiveTenant(): Promise<SharedOverheadAllocationCurrentRow[]> {
  const context = await requireTenantContext();
  return listSharedOverheadAllocationsForTenant(context.tenantId);
}

export async function listSharedOverheadAllocationsForEntryForActiveTenant(
  overheadEntryId: string,
): Promise<SharedOverheadAllocationCurrentRow[]> {
  const context = await requireTenantContext();
  return listSharedOverheadAllocationsForEntry(context.tenantId, overheadEntryId);
}

export async function listSharedOverheadAllocationsForProjectForActiveTenant(
  projectId: string,
): Promise<SharedOverheadAllocationCurrentRow[]> {
  const context = await requireTenantContext();
  return listSharedOverheadAllocationsForProject(context.tenantId, projectId);
}

export async function allocateSharedOverheadEntryForActiveTenant(
  rawInput: unknown,
): Promise<SharedOverheadAllocationActionResult> {
  const parsed = allocateSharedOverheadEntryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner", "admin"]);

  const { data, error } = await allocateSharedOverheadEntry(input);
  if (error || !data) {
    return { error: mapSharedOverheadAllocationError(error) };
  }

  return { allocation: data };
}

export async function reverseSharedOverheadAllocationForActiveTenant(
  rawInput: unknown,
): Promise<SharedOverheadAllocationActionResult> {
  const parsed = reverseSharedOverheadAllocationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const input = parsed.data;

  const context = await requireTenantContext();
  requireTenantRole(context, ["owner"]);

  const { data, error } = await reverseSharedOverheadAllocation(input);
  if (error || !data) {
    return { error: mapSharedOverheadAllocationError(error) };
  }

  return { allocation: data };
}
