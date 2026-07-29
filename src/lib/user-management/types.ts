import type { TenantRole } from "@/lib/auth/tenant";
import type { Enums } from "@/types/database";

export type MembershipStatus = Enums<"membership_status">;
export type InvitationStatus = Enums<"tenant_invitation_status">;

export interface TenantMemberSummary {
  membershipId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: MembershipStatus;
  roles: TenantRole[];
  createdAt: string;
}

// What a prospective member sees for their own pending invitations, across
// any tenant that invited them — used by /invite/accept.
export interface PendingInvitationForUser {
  id: string;
  tenantId: string;
  tenantDisplayName: string;
  role: TenantRole;
  expiresAt: string;
}

// What an owner sees for their own tenant's outstanding invitations — used
// by /app/users.
export interface PendingInvitationForTenant {
  id: string;
  email: string;
  role: TenantRole;
  expiresAt: string;
}

export interface UserManagementActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// Extends the common result shape with the one-time temporary password —
// present only on a successful direct-provisioning conversion, and never
// persisted anywhere beyond this single response.
export interface ProvisionInvitedMemberActionResult extends UserManagementActionResult {
  temporaryPassword?: string;
}
