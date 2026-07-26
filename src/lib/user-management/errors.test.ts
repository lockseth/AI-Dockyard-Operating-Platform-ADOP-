import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { GENERIC_USER_MANAGEMENT_ERROR, mapUserManagementError } from "./errors";

function pgError(code: string, message = ""): PostgrestError {
  return {
    code,
    message,
    details: "",
    hint: "",
    name: "PostgrestError",
    toJSON() {
      return { code, message, details: "", hint: "", name: "PostgrestError" };
    },
  };
}

describe("mapUserManagementError", () => {
  it("falls back to the generic message when there is no error", () => {
    expect(mapUserManagementError(null)).toBe(GENERIC_USER_MANAGEMENT_ERROR);
    expect(mapUserManagementError(undefined)).toBe(GENERIC_USER_MANAGEMENT_ERROR);
  });

  it("maps the last-active-owner trigger message to a friendly string", () => {
    const error = pgError("P0001", "Cannot deactivate the last active owner of a tenant");
    expect(mapUserManagementError(error)).toBe(
      "Tidak dapat menonaktifkan atau mengubah role owner aktif terakhir pada tenant ini.",
    );
  });

  it("maps the last-owner-role trigger message to the same friendly string", () => {
    const error = pgError("P0001", "Cannot remove the last owner role of a tenant");
    expect(mapUserManagementError(error)).toBe(
      "Tidak dapat menonaktifkan atau mengubah role owner aktif terakhir pada tenant ini.",
    );
  });

  it("maps the self-action guard message from set_membership_role/set_membership_status", () => {
    expect(mapUserManagementError(pgError("42501", "Cannot change your own role"))).toBe(
      "Anda tidak dapat mengubah role atau status keanggotaan Anda sendiri.",
    );
    expect(mapUserManagementError(pgError("42501", "Cannot change your own membership status"))).toBe(
      "Anda tidak dapat mengubah role atau status keanggotaan Anda sendiri.",
    );
  });

  it("maps 'already an active member' from create_tenant_invitation", () => {
    expect(
      mapUserManagementError(pgError("P0005", "This user is already an active member of this tenant")),
    ).toBe("Pengguna ini sudah menjadi anggota aktif pada tenant ini.");
  });

  it("maps invitation-ownership and expiry messages from accept_tenant_invitation", () => {
    expect(
      mapUserManagementError(pgError("42501", "This invitation does not belong to the current user")),
    ).toBe("Undangan ini tidak berlaku untuk akun Anda.");
    expect(mapUserManagementError(pgError("P0003", "Invitation already accepted"))).toBe(
      "Undangan ini sudah diterima sebelumnya.",
    );
  });

  it("maps a generic 'Not authorized' RPC rejection to a permission message", () => {
    expect(mapUserManagementError(pgError("42501", "Not authorized to invite members to this tenant"))).toBe(
      "Anda tidak memiliki izin untuk melakukan aksi ini.",
    );
  });

  it("maps P0002 (not found) to a generic not-found message", () => {
    expect(mapUserManagementError(pgError("P0002", "Membership not found"))).toBe("Data tidak ditemukan.");
  });

  it("maps PGRST116 (RLS-filtered single-row query) to a permission message", () => {
    expect(mapUserManagementError(pgError("PGRST116"))).toBe(
      "Anda tidak memiliki izin untuk melakukan aksi ini, atau data tidak ditemukan.",
    );
  });

  it("maps 23505 (unique violation) to an already-a-member message", () => {
    expect(mapUserManagementError(pgError("23505"))).toBe("Pengguna ini sudah terdaftar pada tenant Anda.");
  });

  it("maps 23503 (foreign key violation) to a related-data message", () => {
    expect(mapUserManagementError(pgError("23503"))).toBe("Data terkait tidak ditemukan.");
  });

  it("falls back to the generic message for any other code", () => {
    expect(mapUserManagementError(pgError("99999"))).toBe(GENERIC_USER_MANAGEMENT_ERROR);
  });
});
