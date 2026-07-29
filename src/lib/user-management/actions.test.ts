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
const provisionInvitedMemberDirectly = vi.fn();
const provisionMemberDirectly = vi.fn();
const resetMemberTemporaryPassword = vi.fn();
vi.mock("./service", () => ({
  inviteMember,
  changeMembershipRole,
  setMembershipStatus,
  acceptInvitation,
  provisionInvitedMemberDirectly,
  provisionMemberDirectly,
  resetMemberTemporaryPassword,
}));

const generateTemporaryPassword = vi.fn();
vi.mock("./admin-repository", () => ({ generateTemporaryPassword }));

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

describe("provisionInvitedMemberDirectlyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validFormData() {
    const formData = new FormData();
    formData.set("invitationId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("expectedRole", "viewer");
    return formData;
  }

  // CORRECTIVE (Gate 6G-H): this used to revalidatePath immediately on any
  // non-error result — since every non-error result here carries a
  // temporaryPassword, that dropped the just-accepted row out of the
  // pending-invitations list before the owner could copy the password.
  // Refreshing is now acknowledgeTemporaryPasswordAction's job alone.
  it("never revalidates on a success carrying a temporaryPassword", async () => {
    provisionInvitedMemberDirectly.mockResolvedValueOnce({ temporaryPassword: "Sup3r-Secret-Temp!" });
    const { provisionInvitedMemberDirectlyAction } = await import("./actions");

    const result = await provisionInvitedMemberDirectlyAction({}, validFormData());

    expect(result).toEqual({ temporaryPassword: "Sup3r-Secret-Temp!" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes through a service error without revalidating", async () => {
    provisionInvitedMemberDirectly.mockResolvedValueOnce({ error: "Undangan tidak valid." });
    const { provisionInvitedMemberDirectlyAction } = await import("./actions");

    const result = await provisionInvitedMemberDirectlyAction({}, validFormData());

    expect(result.error).toBe("Undangan tidak valid.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("provisionMemberDirectlyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validFormData() {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "budi@example.com");
    formData.set("role", "viewer");
    formData.set("temporaryPassword", "Str0ngTempPass!");
    return formData;
  }

  it("returns field errors for invalid input without calling the service", async () => {
    const { provisionMemberDirectlyAction } = await import("./actions");
    const formData = new FormData();
    formData.set("displayName", "");
    formData.set("email", "not-an-email");
    formData.set("role", "owner");
    formData.set("temporaryPassword", "short");

    const result = await provisionMemberDirectlyAction({}, formData);

    expect(result.fieldErrors).toBeTruthy();
    expect(provisionMemberDirectly).not.toHaveBeenCalled();
  });

  it("never revalidates on a success carrying a temporaryPassword", async () => {
    provisionMemberDirectly.mockResolvedValueOnce({ temporaryPassword: "Str0ngTempPass!" });
    const { provisionMemberDirectlyAction } = await import("./actions");

    const result = await provisionMemberDirectlyAction({}, validFormData());

    expect(result).toEqual({ temporaryPassword: "Str0ngTempPass!" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps UnauthorizedTenantRoleError to a generic Indonesian message", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    provisionMemberDirectly.mockRejectedValueOnce(new UnauthorizedTenantRoleError());
    const { provisionMemberDirectlyAction } = await import("./actions");

    const result = await provisionMemberDirectlyAction({}, validFormData());

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("resetMemberTemporaryPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function validFormData() {
    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    return formData;
  }

  it("returns field errors for a missing/invalid membershipId without calling the service", async () => {
    const { resetMemberTemporaryPasswordAction } = await import("./actions");
    const formData = new FormData();

    const result = await resetMemberTemporaryPasswordAction({}, formData);

    expect(result.fieldErrors).toBeTruthy();
    expect(resetMemberTemporaryPassword).not.toHaveBeenCalled();
  });

  it("never revalidates on a success carrying a temporaryPassword", async () => {
    resetMemberTemporaryPassword.mockResolvedValueOnce({ temporaryPassword: "Fresh-Temp-1" });
    const { resetMemberTemporaryPasswordAction } = await import("./actions");

    const result = await resetMemberTemporaryPasswordAction({}, validFormData());

    expect(result).toEqual({ temporaryPassword: "Fresh-Temp-1" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("acknowledgeTemporaryPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates /app/users — the single point any temporary-password reveal refreshes the list", async () => {
    const { acknowledgeTemporaryPasswordAction } = await import("./actions");

    await acknowledgeTemporaryPasswordAction();

    expect(revalidatePath).toHaveBeenCalledWith("/app/users");
  });
});

describe("generateTemporaryPasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a candidate from admin-repository's generator", async () => {
    generateTemporaryPassword.mockReturnValueOnce("Generated-Candidate-1");
    const { generateTemporaryPasswordAction } = await import("./actions");

    await expect(generateTemporaryPasswordAction()).resolves.toBe("Generated-Candidate-1");
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
