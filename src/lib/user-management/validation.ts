import { z } from "zod";
import { idSchema, requiredText } from "../master-data/shared/validation";

// Mirrors public.tenant_role (supabase/migrations/20260719070115_
// foundation_tenant_isolation.sql) — kept as a literal list here (not
// generated from src/types/database.ts) the same way the rest of this
// codebase hand-writes its zod schemas alongside the generated DB types.
export const tenantRoleSchema = z.enum(["owner", "admin", "reviewer", "viewer"]);

// A membership can only ever be moved to 'active' or 'suspended' through
// this feature — 'invited' is a system-assigned initial state (set by the
// invite flow) and is never a direct target of the activate/deactivate
// action.
export const settableMembershipStatusSchema = z.enum(["active", "suspended"]);

// Normalized to lowercase here so every downstream comparison (the
// create_tenant_invitation RPC's duplicate/existing-account check,
// accept_tenant_invitation's ownership check) is already working with the
// same casing — the RPC also normalizes defensively, but doing it once here
// keeps the value the UI echoes back consistent too.
export const inviteMemberInputSchema = z.object({
  displayName: requiredText(200, "Nama wajib diisi."),
  email: z
    .string()
    .trim()
    .min(1, "Email wajib diisi.")
    .email("Format email tidak valid.")
    .max(255)
    .transform((value) => value.toLowerCase()),
  role: tenantRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export const changeMembershipRoleInputSchema = z.object({
  membershipId: idSchema,
  role: tenantRoleSchema,
});
export type ChangeMembershipRoleInput = z.infer<typeof changeMembershipRoleInputSchema>;

export const setMembershipStatusInputSchema = z.object({
  membershipId: idSchema,
  status: settableMembershipStatusSchema,
});
export type SetMembershipStatusInput = z.infer<typeof setMembershipStatusInputSchema>;

export const acceptInvitationInputSchema = z.object({
  invitationId: idSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

export function parseInviteMemberFormData(formData: FormData) {
  return inviteMemberInputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
}

export function parseChangeMembershipRoleFormData(formData: FormData) {
  return changeMembershipRoleInputSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });
}

export function parseSetMembershipStatusFormData(formData: FormData) {
  return setMembershipStatusInputSchema.safeParse({
    membershipId: formData.get("membershipId"),
    status: formData.get("status"),
  });
}

export function parseAcceptInvitationFormData(formData: FormData) {
  return acceptInvitationInputSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });
}
