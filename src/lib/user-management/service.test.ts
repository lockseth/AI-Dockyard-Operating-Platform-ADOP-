import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const inviteUserByEmail = vi.fn();
vi.mock("./admin-repository", () => ({ inviteUserByEmail }));

const createTenantInvitationRpc = vi.fn();
const acceptTenantInvitationRpc = vi.fn();
const setMembershipRoleRpc = vi.fn();
const setMembershipStatusRpc = vi.fn();
const listTenantMembers = vi.fn();
const listPendingInvitationsForTenant = vi.fn();
const listPendingInvitationsForCurrentUser = vi.fn();
vi.mock("./repository", () => ({
  createTenantInvitationRpc,
  acceptTenantInvitationRpc,
  setMembershipRoleRpc,
  setMembershipStatusRpc,
  listTenantMembers,
  listPendingInvitationsForTenant,
  listPendingInvitationsForCurrentUser,
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
