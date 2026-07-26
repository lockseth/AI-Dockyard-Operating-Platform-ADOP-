import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const inviteMember = vi.fn();
const changeMembershipRole = vi.fn();
const setMembershipStatus = vi.fn();
const acceptInvitation = vi.fn();
vi.mock("./service", () => ({ inviteMember, changeMembershipRole, setMembershipStatus, acceptInvitation }));

describe("user-management actions source", () => {
  it("never queries a table directly or uses the service-role admin client", () => {
    const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf8");
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/supabase\/admin/);
  });
});

describe("inviteMemberAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validFormData() {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "budi@example.com");
    formData.set("role", "admin");
    return formData;
  }

  it("returns field errors for invalid input without calling the service", async () => {
    const { inviteMemberAction } = await import("./actions");
    const formData = new FormData();
    formData.set("displayName", "");
    formData.set("email", "not-an-email");
    formData.set("role", "admin");

    const result = await inviteMemberAction({}, formData);

    expect(result.fieldErrors).toBeTruthy();
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("maps UnauthorizedTenantRoleError to a generic Indonesian message and skips revalidation", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    inviteMember.mockRejectedValueOnce(new UnauthorizedTenantRoleError());
    const { inviteMemberAction } = await import("./actions");

    const result = await inviteMemberAction({}, validFormData());

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes through a service-returned error without revalidating", async () => {
    inviteMember.mockResolvedValueOnce({ error: "Pengguna ini sudah menjadi anggota aktif pada tenant ini." });
    const { inviteMemberAction } = await import("./actions");

    const result = await inviteMemberAction({}, validFormData());

    expect(result.error).toBe("Pengguna ini sudah menjadi anggota aktif pada tenant ini.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates /app/users on success", async () => {
    inviteMember.mockResolvedValueOnce({});
    const { inviteMemberAction } = await import("./actions");

    const result = await inviteMemberAction({}, validFormData());

    expect(result).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith("/app/users");
  });
});

describe("changeMembershipRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through a service-returned self-action error", async () => {
    changeMembershipRole.mockResolvedValueOnce({
      error: "Anda tidak dapat mengubah role atau status keanggotaan Anda sendiri.",
    });
    const { changeMembershipRoleAction } = await import("./actions");

    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("role", "viewer");

    const result = await changeMembershipRoleAction({}, formData);

    expect(result.error).toMatch(/tidak dapat mengubah role/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setMembershipStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates /app/users on success", async () => {
    setMembershipStatus.mockResolvedValueOnce({});
    const { setMembershipStatusAction } = await import("./actions");

    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("status", "active");

    const result = await setMembershipStatusAction({}, formData);

    expect(result).toEqual({});
    expect(revalidatePath).toHaveBeenCalledWith("/app/users");
  });
});

describe("acceptInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validFormData() {
    const formData = new FormData();
    formData.set("invitationId", "123e4567-e89b-12d3-a456-426614174000");
    return formData;
  }

  it("returns field errors for a missing/invalid invitationId without calling the service", async () => {
    const { acceptInvitationAction } = await import("./actions");
    const formData = new FormData();

    const result = await acceptInvitationAction({}, formData);

    expect(result.fieldErrors).toBeTruthy();
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("returns the service error and does not redirect when acceptance fails", async () => {
    acceptInvitation.mockResolvedValueOnce({ error: "Undangan tidak valid atau sudah kedaluwarsa." });
    const { acceptInvitationAction } = await import("./actions");

    const result = await acceptInvitationAction({}, validFormData());

    expect(result.error).toBe("Undangan tidak valid atau sudah kedaluwarsa.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /tenant/resolve on success", async () => {
    acceptInvitation.mockResolvedValueOnce({});
    const { acceptInvitationAction } = await import("./actions");

    await acceptInvitationAction({}, validFormData());

    expect(redirectMock).toHaveBeenCalledWith("/tenant/resolve");
  });
});
