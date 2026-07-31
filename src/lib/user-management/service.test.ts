import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const inviteUserByEmail = vi.fn();
const setTemporaryPasswordAndConfirm = vi.fn();
const createUserWithTemporaryPassword = vi.fn();
const generateInviteAccessLink = vi.fn();
const generateRecoveryAccessLink = vi.fn();
vi.mock("./admin-repository", () => ({
  inviteUserByEmail,
  setTemporaryPasswordAndConfirm,
  createUserWithTemporaryPassword,
  generateInviteAccessLink,
  generateRecoveryAccessLink,
}));

const createTenantInvitationRpc = vi.fn();
const acceptTenantInvitationRpc = vi.fn();
const ownerProvisionInvitedMemberRpc = vi.fn();
const ownerResolveProvisionTargetRpc = vi.fn();
const ownerFinalizeMemberProvisioningRpc = vi.fn();
const ownerAuthorizeMemberPasswordResetRpc = vi.fn();
const setMembershipRoleRpc = vi.fn();
const setMembershipStatusRpc = vi.fn();
const listTenantMembers = vi.fn();
const listPendingInvitationsForTenant = vi.fn();
const listPendingInvitationsForCurrentUser = vi.fn();
const getMemberEmailByUserId = vi.fn();
vi.mock("./repository", () => ({
  createTenantInvitationRpc,
  acceptTenantInvitationRpc,
  ownerProvisionInvitedMemberRpc,
  ownerResolveProvisionTargetRpc,
  ownerFinalizeMemberProvisioningRpc,
  ownerAuthorizeMemberPasswordResetRpc,
  setMembershipRoleRpc,
  setMembershipStatusRpc,
  listTenantMembers,
  listPendingInvitationsForTenant,
  listPendingInvitationsForCurrentUser,
  getMemberEmailByUserId,
}));

const OWNER_CONTEXT = {
  userId: "owner-1",
  email: "owner@example.com",
  tenantId: "tenant-1",
  tenantDisplayName: "Tenant One",
  membershipId: "membership-owner",
  roles: ["owner"] as const,
  legalEntities: [],
};

const ADMIN_CONTEXT = { ...OWNER_CONTEXT, roles: ["admin"] as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inviteMember", () => {
  it("rejects a non-owner actor before ever calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { inviteMember } = await import("./service");

    await expect(
      inviteMember({ displayName: "Budi", email: "budi@example.com", role: "viewer" }),
    ).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(createTenantInvitationRpc).not.toHaveBeenCalled();
  });

  it("maps a create_tenant_invitation error (e.g. already an active member)", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: "P0005", message: "This user is already an active member of this tenant" },
    });
    const { inviteMember } = await import("./service");

    const result = await inviteMember({ displayName: "Budi", email: "budi@example.com", role: "viewer" });

    expect(result.error).toBe("Pengguna ini sudah menjadi anggota aktif pada tenant ini.");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("does not send an invite email when the target account already exists", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: true },
      error: null,
    });
    const { inviteMember } = await import("./service");

    const result = await inviteMember({ displayName: "Budi", email: "budi@example.com", role: "viewer" });

    expect(result).toEqual({});
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("sends a real invite email for a brand-new email and still creates only the pending invitation", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: false },
      error: null,
    });
    inviteUserByEmail.mockResolvedValue({ userId: "new-user-1" });
    const { inviteMember } = await import("./service");

    const result = await inviteMember({ displayName: "Budi", email: "budi@example.com", role: "admin" });

    expect(result).toEqual({});
    expect(inviteUserByEmail).toHaveBeenCalledWith("budi@example.com", "Budi", "/invite/accept");
  });

  it("surfaces a friendly error when the invite email fails to send, without erroring the whole request as data loss", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: false },
      error: null,
    });
    inviteUserByEmail.mockResolvedValue({ error: "smtp down" });
    const { inviteMember } = await import("./service");

    const result = await inviteMember({ displayName: "Budi", email: "budi@example.com", role: "admin" });

    expect(result.error).toMatch(/coba kirim ulang/);
  });
});

describe("acceptInvitation", () => {
  it("maps a thrown RPC error (e.g. wrong user) via mapUserManagementError", async () => {
    acceptTenantInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "This invitation does not belong to the current user" },
    });
    const { acceptInvitation } = await import("./service");

    const result = await acceptInvitation("invitation-1");

    expect(result.error).toBe("Undangan ini tidak berlaku untuk akun Anda.");
  });

  it("maps a null (non-error) result — expired-but-pending — to the invalid/expired message", async () => {
    acceptTenantInvitationRpc.mockResolvedValue({ data: null, error: null });
    const { acceptInvitation } = await import("./service");

    const result = await acceptInvitation("invitation-1");

    expect(result.error).toBe("Undangan tidak valid atau sudah kedaluwarsa. Minta undangan baru dari owner.");
  });

  it("returns {} on success", async () => {
    acceptTenantInvitationRpc.mockResolvedValue({ data: "membership-1", error: null });
    const { acceptInvitation } = await import("./service");

    const result = await acceptInvitation("invitation-1");

    expect(result).toEqual({});
  });
});

describe("provisionInvitedMemberDirectly", () => {
  it("rejects a non-owner actor before ever calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { provisionInvitedMemberDirectly } = await import("./service");

    await expect(
      provisionInvitedMemberDirectly({ invitationId: "invitation-1", expectedRole: "viewer" }),
    ).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(ownerProvisionInvitedMemberRpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC error (e.g. cross-tenant conflict) via mapUserManagementError", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerProvisionInvitedMemberRpc.mockResolvedValue({
      data: null,
      error: { code: "P000F", message: "cross_tenant_pending_invitation_conflict" },
    });
    const { provisionInvitedMemberDirectly } = await import("./service");

    const result = await provisionInvitedMemberDirectly({ invitationId: "invitation-1", expectedRole: "viewer" });

    expect(result.error).toMatch(/tenant lain/);
    expect(setTemporaryPasswordAndConfirm).not.toHaveBeenCalled();
  });

  it("maps a null (non-error) result — expired-but-pending — to the invalid/expired message", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerProvisionInvitedMemberRpc.mockResolvedValue({ data: null, error: null });
    const { provisionInvitedMemberDirectly } = await import("./service");

    const result = await provisionInvitedMemberDirectly({ invitationId: "invitation-1", expectedRole: "viewer" });

    expect(result.error).toBe("Undangan tidak valid, sudah kedaluwarsa, atau bukan lagi berstatus pending.");
    expect(setTemporaryPasswordAndConfirm).not.toHaveBeenCalled();
  });

  it("on success, sets a temporary password for the resolved target and returns it", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerProvisionInvitedMemberRpc.mockResolvedValue({
      data: { membershipId: "membership-1", targetUserId: "target-user-1" },
      error: null,
    });
    setTemporaryPasswordAndConfirm.mockResolvedValue({ temporaryPassword: "Sup3r-Secret-Temp!" });
    const { provisionInvitedMemberDirectly } = await import("./service");

    const result = await provisionInvitedMemberDirectly({ invitationId: "invitation-1", expectedRole: "viewer" });

    expect(result).toEqual({ temporaryPassword: "Sup3r-Secret-Temp!" });
    expect(setTemporaryPasswordAndConfirm).toHaveBeenCalledWith("target-user-1");
  });

  it("reports a generic error and never surfaces a password when the membership succeeds but the password step fails", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerProvisionInvitedMemberRpc.mockResolvedValue({
      data: { membershipId: "membership-1", targetUserId: "target-user-1" },
      error: null,
    });
    setTemporaryPasswordAndConfirm.mockResolvedValue({ error: "admin api unreachable" });
    const { provisionInvitedMemberDirectly } = await import("./service");

    const result = await provisionInvitedMemberDirectly({ invitationId: "invitation-1", expectedRole: "viewer" });

    expect(result.temporaryPassword).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/admin api unreachable/);
  });
});

describe("provisionMemberDirectly", () => {
  const INPUT = {
    displayName: "Budi",
    email: "budi@example.com",
    role: "viewer" as const,
    temporaryPassword: "Str0ngTempPass!",
  };

  it("rejects a non-owner actor before ever resolving the target", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { provisionMemberDirectly } = await import("./service");

    await expect(provisionMemberDirectly(INPUT)).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(ownerResolveProvisionTargetRpc).not.toHaveBeenCalled();
  });

  it("stops before touching the Admin API when the target has a membership in another tenant", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerResolveProvisionTargetRpc.mockResolvedValue({
      data: {
        targetUserId: "existing-user-1",
        sameTenantMembershipId: null,
        sameTenantStatus: null,
        crossTenantConflict: true,
        pendingInvitationId: null,
      },
      error: null,
    });
    const { provisionMemberDirectly } = await import("./service");

    const result = await provisionMemberDirectly(INPUT);

    expect(result.error).toMatch(/tenant lain/);
    expect(createUserWithTemporaryPassword).not.toHaveBeenCalled();
    expect(ownerFinalizeMemberProvisioningRpc).not.toHaveBeenCalled();
  });

  it("stops as a duplicate when the target is already an active member of this tenant", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerResolveProvisionTargetRpc.mockResolvedValue({
      data: {
        targetUserId: "existing-user-1",
        sameTenantMembershipId: "membership-1",
        sameTenantStatus: "active",
        crossTenantConflict: false,
        pendingInvitationId: null,
      },
      error: null,
    });
    const { provisionMemberDirectly } = await import("./service");

    const result = await provisionMemberDirectly(INPUT);

    expect(result.error).toBe("Pengguna ini sudah menjadi anggota aktif pada tenant ini.");
    expect(createUserWithTemporaryPassword).not.toHaveBeenCalled();
    expect(ownerFinalizeMemberProvisioningRpc).not.toHaveBeenCalled();
  });

  it("creates a brand-new auth user for an email with no existing account, then finalizes with it", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerResolveProvisionTargetRpc.mockResolvedValue({
      data: {
        targetUserId: null,
        sameTenantMembershipId: null,
        sameTenantStatus: null,
        crossTenantConflict: false,
        pendingInvitationId: "invitation-1",
      },
      error: null,
    });
    createUserWithTemporaryPassword.mockResolvedValue({ userId: "new-user-1" });
    ownerFinalizeMemberProvisioningRpc.mockResolvedValue({
      data: { membershipId: "membership-1", reactivated: false },
      error: null,
    });
    const { provisionMemberDirectly } = await import("./service");

    const result = await provisionMemberDirectly(INPUT);

    expect(createUserWithTemporaryPassword).toHaveBeenCalledWith("budi@example.com", "Budi", "Str0ngTempPass!");
    expect(ownerFinalizeMemberProvisioningRpc).toHaveBeenCalledWith(
      "tenant-1",
      "new-user-1",
      "viewer",
      "invitation-1",
      true,
    );
    expect(setTemporaryPasswordAndConfirm).not.toHaveBeenCalled();
    expect(result).toEqual({ temporaryPassword: "Str0ngTempPass!" });
  });

  it("reuses an existing auth user without creating a duplicate, setting the password only after finalize succeeds", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerResolveProvisionTargetRpc.mockResolvedValue({
      data: {
        targetUserId: "existing-user-1",
        sameTenantMembershipId: "membership-1",
        sameTenantStatus: "suspended",
        crossTenantConflict: false,
        pendingInvitationId: null,
      },
      error: null,
    });
    ownerFinalizeMemberProvisioningRpc.mockResolvedValue({
      data: { membershipId: "membership-1", reactivated: true },
      error: null,
    });
    setTemporaryPasswordAndConfirm.mockResolvedValue({ temporaryPassword: "Fresh-Temp-1" });
    const { provisionMemberDirectly } = await import("./service");

    const result = await provisionMemberDirectly(INPUT);

    expect(createUserWithTemporaryPassword).not.toHaveBeenCalled();
    expect(ownerFinalizeMemberProvisioningRpc).toHaveBeenCalledWith(
      "tenant-1",
      "existing-user-1",
      "viewer",
      null,
      false,
    );
    expect(setTemporaryPasswordAndConfirm).toHaveBeenCalledWith("existing-user-1");
    expect(result).toEqual({ temporaryPassword: "Fresh-Temp-1" });
  });

  it("reports a recoverable error (pointing at Reset Password Sementara) when finalize succeeds but the password step fails", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerResolveProvisionTargetRpc.mockResolvedValue({
      data: {
        targetUserId: "existing-user-1",
        sameTenantMembershipId: null,
        sameTenantStatus: null,
        crossTenantConflict: false,
        pendingInvitationId: null,
      },
      error: null,
    });
    ownerFinalizeMemberProvisioningRpc.mockResolvedValue({
      data: { membershipId: "membership-1", reactivated: false },
      error: null,
    });
    setTemporaryPasswordAndConfirm.mockResolvedValue({ error: "admin api unreachable" });
    const { provisionMemberDirectly } = await import("./service");

    const result = await provisionMemberDirectly(INPUT);

    expect(result.temporaryPassword).toBeUndefined();
    expect(result.error).toMatch(/Reset Password Sementara/);
    expect(JSON.stringify(result)).not.toMatch(/admin api unreachable/);
  });
});

describe("resetMemberTemporaryPassword", () => {
  it("rejects a non-owner actor before ever calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { resetMemberTemporaryPassword } = await import("./service");

    await expect(resetMemberTemporaryPassword({ membershipId: "membership-1" })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
    expect(ownerAuthorizeMemberPasswordResetRpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC error (e.g. self-target) via mapUserManagementError", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Cannot reset your own temporary password" },
    });
    const { resetMemberTemporaryPassword } = await import("./service");

    const result = await resetMemberTemporaryPassword({ membershipId: "membership-1" });

    expect(result.error).toBe("Anda tidak dapat mereset kata sandi Anda sendiri.");
    expect(setTemporaryPasswordAndConfirm).not.toHaveBeenCalled();
  });

  it("on success, sets a fresh temporary password for the authorized target and returns it", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({ data: "target-user-1", error: null });
    setTemporaryPasswordAndConfirm.mockResolvedValue({ temporaryPassword: "Another-Fresh-1" });
    const { resetMemberTemporaryPassword } = await import("./service");

    const result = await resetMemberTemporaryPassword({ membershipId: "membership-1" });

    expect(setTemporaryPasswordAndConfirm).toHaveBeenCalledWith("target-user-1");
    expect(result).toEqual({ temporaryPassword: "Another-Fresh-1" });
  });
});

describe("changeMembershipRole", () => {
  it("rejects a non-owner actor", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { changeMembershipRole } = await import("./service");

    await expect(changeMembershipRole({ membershipId: "membership-x", role: "viewer" })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
    expect(setMembershipRoleRpc).not.toHaveBeenCalled();
  });

  it("maps the self-role-change rejection from set_membership_role", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    setMembershipRoleRpc.mockResolvedValue({ error: { code: "42501", message: "Cannot change your own role" } });
    const { changeMembershipRole } = await import("./service");

    const result = await changeMembershipRole({ membershipId: "membership-owner", role: "viewer" });

    expect(result.error).toBe("Anda tidak dapat mengubah role atau status keanggotaan Anda sendiri.");
  });

  it("calls the RPC and returns {} on success", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    setMembershipRoleRpc.mockResolvedValue({ error: null });
    const { changeMembershipRole } = await import("./service");

    const result = await changeMembershipRole({ membershipId: "membership-x", role: "admin" });

    expect(result).toEqual({});
    expect(setMembershipRoleRpc).toHaveBeenCalledWith("membership-x", "admin");
  });
});

describe("setMembershipStatus", () => {
  it("rejects a non-owner actor", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { setMembershipStatus } = await import("./service");

    await expect(setMembershipStatus({ membershipId: "membership-x", status: "suspended" })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
  });

  it("maps the last-owner rejection from set_membership_status", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    setMembershipStatusRpc.mockResolvedValue({
      error: { code: "P0001", message: "Cannot deactivate the last active owner of a tenant" },
    });
    const { setMembershipStatus } = await import("./service");

    const result = await setMembershipStatus({ membershipId: "membership-owner", status: "suspended" });

    expect(result.error).toBe("Tidak dapat menonaktifkan atau mengubah role owner aktif terakhir pada tenant ini.");
  });

  it("calls the RPC and returns {} on success", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    setMembershipStatusRpc.mockResolvedValue({ error: null });
    const { setMembershipStatus } = await import("./service");

    const result = await setMembershipStatus({ membershipId: "membership-x", status: "suspended" });

    expect(result).toEqual({});
    expect(setMembershipStatusRpc).toHaveBeenCalledWith("membership-x", "suspended");
  });
});

describe("generateMemberInviteAccessLink", () => {
  it("rejects a non-owner actor before ever calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { generateMemberInviteAccessLink } = await import("./service");

    await expect(
      generateMemberInviteAccessLink({ displayName: "Budi", email: "budi@example.com", role: "viewer" }),
    ).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(createTenantInvitationRpc).not.toHaveBeenCalled();
  });

  it("maps a create_tenant_invitation error via mapUserManagementError", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: null,
      error: { code: "P0005", message: "This user is already an active member of this tenant" },
    });
    const { generateMemberInviteAccessLink } = await import("./service");

    const result = await generateMemberInviteAccessLink({
      displayName: "Budi",
      email: "budi@example.com",
      role: "viewer",
    });

    expect(result.error).toBe("Pengguna ini sudah menjadi anggota aktif pada tenant ini.");
    expect(generateInviteAccessLink).not.toHaveBeenCalled();
  });

  it("does not generate a link — and reports no error verdict as a link — when the target account already exists", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: true },
      error: null,
    });
    const { generateMemberInviteAccessLink } = await import("./service");

    const result = await generateMemberInviteAccessLink({
      displayName: "Budi",
      email: "budi@example.com",
      role: "viewer",
    });

    expect(generateInviteAccessLink).not.toHaveBeenCalled();
    expect(result.actionLink).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("generates a link (via admin.generateLink, never an email send) for a brand-new email, redirecting only to /invite/accept", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: false },
      error: null,
    });
    generateInviteAccessLink.mockResolvedValue({ userId: "new-user-1", actionLink: "https://supabase.example/verify?token=abc" });
    const { generateMemberInviteAccessLink } = await import("./service");

    const result = await generateMemberInviteAccessLink({
      displayName: "Budi",
      email: "budi@example.com",
      role: "admin",
    });

    expect(generateInviteAccessLink).toHaveBeenCalledWith("budi@example.com", "Budi", "/invite/accept");
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ actionLink: "https://supabase.example/verify?token=abc" });
  });

  it("surfaces a friendly error and never leaks the provider's raw error text when link generation fails", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createTenantInvitationRpc.mockResolvedValue({
      data: { invitationId: "invitation-1", targetUserExists: false },
      error: null,
    });
    generateInviteAccessLink.mockResolvedValue({ error: "service-role key rejected: internal-secret-detail" });
    const { generateMemberInviteAccessLink } = await import("./service");

    const result = await generateMemberInviteAccessLink({
      displayName: "Budi",
      email: "budi@example.com",
      role: "admin",
    });

    expect(result.actionLink).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/internal-secret-detail/);
  });
});

describe("generateMemberRecoveryAccessLink", () => {
  it("rejects a non-owner actor before ever calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { generateMemberRecoveryAccessLink } = await import("./service");

    await expect(generateMemberRecoveryAccessLink({ membershipId: "membership-1" })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
    expect(ownerAuthorizeMemberPasswordResetRpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC error (e.g. self-target) via mapUserManagementError", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Cannot reset your own temporary password" },
    });
    const { generateMemberRecoveryAccessLink } = await import("./service");

    const result = await generateMemberRecoveryAccessLink({ membershipId: "membership-1" });

    expect(result.error).toBe("Anda tidak dapat mereset kata sandi Anda sendiri.");
    expect(getMemberEmailByUserId).not.toHaveBeenCalled();
    expect(generateRecoveryAccessLink).not.toHaveBeenCalled();
  });

  it("generates a link (via admin.generateLink, never a password set) for the authorized target, redirecting only to /reset-password", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({ data: "target-user-1", error: null });
    getMemberEmailByUserId.mockResolvedValue("budi@example.com");
    generateRecoveryAccessLink.mockResolvedValue({ actionLink: "https://supabase.example/verify?token=xyz" });
    const { generateMemberRecoveryAccessLink } = await import("./service");

    const result = await generateMemberRecoveryAccessLink({ membershipId: "membership-1" });

    expect(getMemberEmailByUserId).toHaveBeenCalledWith("target-user-1");
    expect(generateRecoveryAccessLink).toHaveBeenCalledWith("budi@example.com", "/reset-password");
    expect(setTemporaryPasswordAndConfirm).not.toHaveBeenCalled();
    expect(result).toEqual({ actionLink: "https://supabase.example/verify?token=xyz" });
  });

  it("reports a generic error when the target's email cannot be resolved, without calling the Admin API", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({ data: "target-user-1", error: null });
    getMemberEmailByUserId.mockResolvedValue(null);
    const { generateMemberRecoveryAccessLink } = await import("./service");

    const result = await generateMemberRecoveryAccessLink({ membershipId: "membership-1" });

    expect(generateRecoveryAccessLink).not.toHaveBeenCalled();
    expect(result.actionLink).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("surfaces a friendly error and never leaks the provider's raw error text when link generation fails", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    ownerAuthorizeMemberPasswordResetRpc.mockResolvedValue({ data: "target-user-1", error: null });
    getMemberEmailByUserId.mockResolvedValue("budi@example.com");
    generateRecoveryAccessLink.mockResolvedValue({ error: "provider down: internal-secret-detail" });
    const { generateMemberRecoveryAccessLink } = await import("./service");

    const result = await generateMemberRecoveryAccessLink({ membershipId: "membership-1" });

    expect(result.actionLink).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/internal-secret-detail/);
  });
});
