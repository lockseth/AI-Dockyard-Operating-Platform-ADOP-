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

// `expectedRole` is the role the owner saw displayed for this pending
// invitation, submitted back as an integrity check — not a role picker. The
// RPC rejects the call if the invitation's actual current role has since
// changed, catching a stale page rather than letting the owner choose an
// arbitrary role at conversion time.
export const provisionInvitedMemberInputSchema = z.object({
  invitationId: idSchema,
  expectedRole: tenantRoleSchema,
});
export type ProvisionInvitedMemberInput = z.infer<typeof provisionInvitedMemberInputSchema>;

// Floor the owner can't type below, even though the generated default
// (admin-repository.ts's generateTemporaryPassword, 20 chars) is well above
// it — "dapat ... diganti Owner" means this has to accept an owner-edited
// value, so server-side strength is re-checked here rather than trusted
// from the client.
export const temporaryPasswordSchema = z
  .string()
  .min(12, "Kata sandi sementara minimal 12 karakter.")
  .max(72, "Kata sandi sementara maksimal 72 karakter.")
  .regex(/[a-z]/, "Kata sandi sementara harus mengandung huruf kecil.")
  .regex(/[A-Z]/, "Kata sandi sementara harus mengandung huruf besar.")
  .regex(/[0-9]/, "Kata sandi sementara harus mengandung angka.");

// "Tambah User Internal" only ever offers Admin or Viewer — deliberately a
// narrower enum than tenantRoleSchema (which also allows owner/reviewer),
// since this action is scoped to internal staff, not ownership transfer or
// external reviewer access. Enforced here, not just in the UI's <select>,
// so a hand-crafted request can't submit an owner/reviewer role through
// this endpoint.
export const internalUserRoleSchema = z.enum(["admin", "viewer"]);

export const provisionMemberInputSchema = z.object({
  displayName: requiredText(200, "Nama wajib diisi."),
  email: z
    .string()
    .trim()
    .min(1, "Email wajib diisi.")
    .email("Format email tidak valid.")
    .max(255)
    .transform((value) => value.toLowerCase()),
  role: internalUserRoleSchema,
  temporaryPassword: temporaryPasswordSchema,
});
export type ProvisionMemberInput = z.infer<typeof provisionMemberInputSchema>;

export const resetMemberTemporaryPasswordInputSchema = z.object({
  membershipId: idSchema,
});
export type ResetMemberTemporaryPasswordInput = z.infer<typeof resetMemberTemporaryPasswordInputSchema>;

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

export function parseProvisionInvitedMemberFormData(formData: FormData) {
  return provisionInvitedMemberInputSchema.safeParse({
    invitationId: formData.get("invitationId"),
    expectedRole: formData.get("expectedRole"),
  });
}

export function parseProvisionMemberFormData(formData: FormData) {
  return provisionMemberInputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    role: formData.get("role"),
    temporaryPassword: formData.get("temporaryPassword"),
  });
}

export function parseResetMemberTemporaryPasswordFormData(formData: FormData) {
  return resetMemberTemporaryPasswordInputSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
}
