import { describe, expect, it } from "vitest";
import {
  parseAcceptInvitationFormData,
  parseChangeMembershipRoleFormData,
  parseInviteMemberFormData,
  parseProvisionInvitedMemberFormData,
  parseProvisionMemberFormData,
  parseResetMemberTemporaryPasswordFormData,
  parseSetMembershipStatusFormData,
} from "./validation";

describe("parseInviteMemberFormData", () => {
  it("accepts a valid invite", () => {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "budi@example.com");
    formData.set("role", "admin");

    const result = parseInviteMemberFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        displayName: "Budi Santoso",
        email: "budi@example.com",
        role: "admin",
      });
    }
  });

  it("rejects an invalid email", () => {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "not-an-email");
    formData.set("role", "admin");

    const result = parseInviteMemberFormData(formData);
    expect(result.success).toBe(false);
  });

  it("normalizes email casing to lowercase", () => {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "Budi@Example.COM");
    formData.set("role", "admin");

    const result = parseInviteMemberFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("budi@example.com");
    }
  });

  it("rejects a role outside the tenant_role enum", () => {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "budi@example.com");
    formData.set("role", "superadmin");

    const result = parseInviteMemberFormData(formData);
    expect(result.success).toBe(false);
  });

  it("rejects a missing display name", () => {
    const formData = new FormData();
    formData.set("email", "budi@example.com");
    formData.set("role", "admin");

    const result = parseInviteMemberFormData(formData);
    expect(result.success).toBe(false);
  });
});

describe("parseChangeMembershipRoleFormData", () => {
  it("accepts a valid membershipId + role", () => {
    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("role", "viewer");

    const result = parseChangeMembershipRoleFormData(formData);
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid membershipId", () => {
    const formData = new FormData();
    formData.set("membershipId", "not-a-uuid");
    formData.set("role", "viewer");

    const result = parseChangeMembershipRoleFormData(formData);
    expect(result.success).toBe(false);
  });
});

describe("parseSetMembershipStatusFormData", () => {
  function formDataWithStatus(status: string) {
    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("status", status);
    return formData;
  }

  it("accepts 'active' and 'suspended' but not 'invited'", () => {
    expect(parseSetMembershipStatusFormData(formDataWithStatus("active")).success).toBe(true);
    expect(parseSetMembershipStatusFormData(formDataWithStatus("suspended")).success).toBe(true);
    expect(parseSetMembershipStatusFormData(formDataWithStatus("invited")).success).toBe(false);
  });
});

describe("parseAcceptInvitationFormData", () => {
  it("accepts a valid invitationId", () => {
    const formData = new FormData();
    formData.set("invitationId", "123e4567-e89b-12d3-a456-426614174000");
    expect(parseAcceptInvitationFormData(formData).success).toBe(true);
  });

  it("rejects a non-uuid invitationId", () => {
    const formData = new FormData();
    formData.set("invitationId", "not-a-uuid");
    expect(parseAcceptInvitationFormData(formData).success).toBe(false);
  });
});

describe("parseProvisionInvitedMemberFormData", () => {
  it("accepts a valid invitationId + expectedRole", () => {
    const formData = new FormData();
    formData.set("invitationId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("expectedRole", "admin");
    expect(parseProvisionInvitedMemberFormData(formData).success).toBe(true);
  });

  it("rejects a non-uuid invitationId", () => {
    const formData = new FormData();
    formData.set("invitationId", "not-a-uuid");
    formData.set("expectedRole", "admin");
    expect(parseProvisionInvitedMemberFormData(formData).success).toBe(false);
  });

  it("rejects an expectedRole outside the tenant_role enum", () => {
    const formData = new FormData();
    formData.set("invitationId", "123e4567-e89b-12d3-a456-426614174000");
    formData.set("expectedRole", "superadmin");
    expect(parseProvisionInvitedMemberFormData(formData).success).toBe(false);
  });
});

describe("parseProvisionMemberFormData", () => {
  function validFormData() {
    const formData = new FormData();
    formData.set("displayName", "Budi Santoso");
    formData.set("email", "budi@example.com");
    formData.set("role", "viewer");
    formData.set("temporaryPassword", "Str0ngTempPass!");
    return formData;
  }

  it("accepts a valid submission", () => {
    const result = parseProvisionMemberFormData(validFormData());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        displayName: "Budi Santoso",
        email: "budi@example.com",
        role: "viewer",
        temporaryPassword: "Str0ngTempPass!",
      });
    }
  });

  it("rejects owner and reviewer — only admin/viewer are offered by this action", () => {
    for (const role of ["owner", "reviewer"]) {
      const formData = validFormData();
      formData.set("role", role);
      expect(parseProvisionMemberFormData(formData).success).toBe(false);
    }
  });

  it("rejects a temporary password shorter than 12 characters", () => {
    const formData = validFormData();
    formData.set("temporaryPassword", "Sh0rt!");
    expect(parseProvisionMemberFormData(formData).success).toBe(false);
  });

  it("rejects a temporary password missing an uppercase letter", () => {
    const formData = validFormData();
    formData.set("temporaryPassword", "alllowercase123");
    expect(parseProvisionMemberFormData(formData).success).toBe(false);
  });

  it("rejects a temporary password missing a digit", () => {
    const formData = validFormData();
    formData.set("temporaryPassword", "NoDigitsHereAtAll");
    expect(parseProvisionMemberFormData(formData).success).toBe(false);
  });

  it("normalizes email casing to lowercase", () => {
    const formData = validFormData();
    formData.set("email", "Budi@Example.COM");
    const result = parseProvisionMemberFormData(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("budi@example.com");
    }
  });
});

describe("parseResetMemberTemporaryPasswordFormData", () => {
  it("accepts a valid membershipId", () => {
    const formData = new FormData();
    formData.set("membershipId", "123e4567-e89b-12d3-a456-426614174000");
    expect(parseResetMemberTemporaryPasswordFormData(formData).success).toBe(true);
  });

  it("rejects a non-uuid membershipId", () => {
    const formData = new FormData();
    formData.set("membershipId", "not-a-uuid");
    expect(parseResetMemberTemporaryPasswordFormData(formData).success).toBe(false);
  });
});
