import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const getLatestAssistantChannelIdentityForUser = vi.fn();
const issuePairingChallenge = vi.fn();
const revokePairing = vi.fn();
const listAssistantChannelIdentitiesForTenant = vi.fn();
const issueClientVerificationChallenge = vi.fn();
const resetClientVerification = vi.fn();
vi.mock("./repository", () => ({
  getLatestAssistantChannelIdentityForUser,
  issuePairingChallenge,
  revokePairing,
  listAssistantChannelIdentitiesForTenant,
  issueClientVerificationChallenge,
  resetClientVerification,
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

const ADMIN_CONTEXT = { ...OWNER_CONTEXT, userId: "admin-1", roles: ["admin"] as const };

function identityRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "identity-1",
    tenant_id: "tenant-1",
    user_id: "owner-1",
    channel: "whatsapp",
    normalized_address: "+6281234567890",
    status: "pending",
    challenge_expires_at: "2026-08-11T10:00:00.000Z",
    challenge_attempt_count: 0,
    verified_at: null,
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    created_by: "owner-1",
    created_at: "2026-08-11T09:50:00.000Z",
    updated_at: "2026-08-11T09:50:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOwnerWhatsappRegistrationForActiveTenant", () => {
  it("rejects a non-owner actor before ever reading the identity table", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { getOwnerWhatsappRegistrationForActiveTenant } = await import("./service");

    await expect(getOwnerWhatsappRegistrationForActiveTenant()).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(getLatestAssistantChannelIdentityForUser).not.toHaveBeenCalled();
  });

  it("reports not_registered when no row exists", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(null);
    const { getOwnerWhatsappRegistrationForActiveTenant } = await import("./service");

    await expect(getOwnerWhatsappRegistrationForActiveTenant()).resolves.toEqual({
      status: "not_registered",
      normalizedAddress: null,
      challengeExpiresAt: null,
    });
    expect(getLatestAssistantChannelIdentityForUser).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "owner-1",
      channel: "whatsapp",
    });
  });

  it("reports not_registered when the newest row is revoked", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(identityRow({ status: "revoked" }));
    const { getOwnerWhatsappRegistrationForActiveTenant } = await import("./service");

    await expect(getOwnerWhatsappRegistrationForActiveTenant()).resolves.toEqual({
      status: "not_registered",
      normalizedAddress: null,
      challengeExpiresAt: null,
    });
  });

  it("reports pending with the address and expiry", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(identityRow({ status: "pending" }));
    const { getOwnerWhatsappRegistrationForActiveTenant } = await import("./service");

    await expect(getOwnerWhatsappRegistrationForActiveTenant()).resolves.toEqual({
      status: "pending",
      normalizedAddress: "+6281234567890",
      challengeExpiresAt: "2026-08-11T10:00:00.000Z",
    });
  });

  it("reports verified with the address and no expiry", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(
      identityRow({ status: "verified", verified_at: "2026-08-11T09:55:00.000Z" }),
    );
    const { getOwnerWhatsappRegistrationForActiveTenant } = await import("./service");

    await expect(getOwnerWhatsappRegistrationForActiveTenant()).resolves.toEqual({
      status: "verified",
      normalizedAddress: "+6281234567890",
      challengeExpiresAt: null,
    });
  });
});

describe("registerOwnerWhatsappNumberForActiveTenant", () => {
  it("rejects a non-owner actor before ever touching the identity table", async () => {
    requireTenantContext.mockResolvedValue(ADMIN_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    await expect(registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "081234567890" })).rejects.toThrow(
      UnauthorizedTenantRoleError,
    );
    expect(getLatestAssistantChannelIdentityForUser).not.toHaveBeenCalled();
    expect(issuePairingChallenge).not.toHaveBeenCalled();
  });

  it("rejects a blank rawNumber with a field error, never calling the RPC", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "" });
    expect(result.fieldErrors?.rawNumber).toBeTruthy();
    expect(issuePairingChallenge).not.toHaveBeenCalled();
  });

  it("rejects a number it cannot unambiguously normalize (non-Indonesian format)", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(null);
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "1-800-555-0100" });
    expect(result.fieldErrors?.rawNumber).toBeTruthy();
    expect(issuePairingChallenge).not.toHaveBeenCalled();
  });

  it.each([
    ["081234567890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
    ["+6281234567890", "+6281234567890"],
    ["0812-3456-7890", "+6281234567890"],
  ])("normalizes %s to the same canonical address %s and issues a fresh challenge when nothing is registered", async (raw, expected) => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(null);
    issuePairingChallenge.mockResolvedValue({
      data: [{ identity_id: "identity-1", challenge_code: "ABCDEF", challenge_expires_at: "2026-08-11T10:00:00.000Z" }],
      error: null,
    });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: raw });
    expect(result.data).toEqual({
      outcome: "challenge_issued",
      normalizedAddress: expected,
      challengeCode: "ABCDEF",
      challengeExpiresAt: "2026-08-11T10:00:00.000Z",
    });
    expect(issuePairingChallenge).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      channel: "whatsapp",
      normalizedAddress: expected,
    });
    expect(revokePairing).not.toHaveBeenCalled();
  });

  it("re-issues a challenge without an explicit revoke when the current row is only pending", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(
      identityRow({ status: "pending", normalized_address: "+6281111111111" }),
    );
    issuePairingChallenge.mockResolvedValue({
      data: [{ identity_id: "identity-2", challenge_code: "GHIJKL", challenge_expires_at: "2026-08-11T10:05:00.000Z" }],
      error: null,
    });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "082222222222" });
    expect(result.data?.outcome).toBe("challenge_issued");
    expect(revokePairing).not.toHaveBeenCalled();
    expect(issuePairingChallenge).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      channel: "whatsapp",
      normalizedAddress: "+6282222222222",
    });
  });

  it("is a pure no-op when resubmitting the number that is already verified", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(
      identityRow({ status: "verified", normalized_address: "+6281234567890" }),
    );
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "081234567890" });
    expect(result.data).toEqual({ outcome: "already_verified", normalizedAddress: "+6281234567890" });
    expect(revokePairing).not.toHaveBeenCalled();
    expect(issuePairingChallenge).not.toHaveBeenCalled();
  });

  it("revokes the prior verified binding before issuing a challenge for a changed number", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(
      identityRow({ id: "old-identity", status: "verified", normalized_address: "+6281234567890" }),
    );
    revokePairing.mockResolvedValue({ data: identityRow({ id: "old-identity", status: "revoked" }), error: null });
    issuePairingChallenge.mockResolvedValue({
      data: [{ identity_id: "new-identity", challenge_code: "ZZZZZZ", challenge_expires_at: "2026-08-11T11:00:00.000Z" }],
      error: null,
    });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "089999999999" });

    expect(revokePairing).toHaveBeenCalledWith({ identityId: "old-identity", reason: "owner_number_changed" });
    expect(issuePairingChallenge).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      channel: "whatsapp",
      normalizedAddress: "+6289999999999",
    });
    expect(result.data).toEqual({
      outcome: "challenge_issued",
      normalizedAddress: "+6289999999999",
      challengeCode: "ZZZZZZ",
      challengeExpiresAt: "2026-08-11T11:00:00.000Z",
    });

    // Ordering matters: the revoke must complete before the new challenge is
    // issued (never both verified rows alive at once).
    const revokeOrder = revokePairing.mock.invocationCallOrder[0];
    const issueOrder = issuePairingChallenge.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(issueOrder);
  });

  it("stops and surfaces an error when revoking the prior verified binding fails, never issuing a new challenge", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(
      identityRow({ id: "old-identity", status: "verified", normalized_address: "+6281234567890" }),
    );
    revokePairing.mockResolvedValue({ data: null, error: { code: "P0002", message: "not found" } });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "089999999999" });
    expect(result.error).toBeTruthy();
    expect(issuePairingChallenge).not.toHaveBeenCalled();
  });

  it("maps an issuePairingChallenge RPC error instead of throwing", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(null);
    issuePairingChallenge.mockResolvedValue({ data: null, error: { code: "42501", message: "not authorized" } });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    const result = await registerOwnerWhatsappNumberForActiveTenant({ rawNumber: "081234567890" });
    expect(result.error).toBeTruthy();
  });

  it("never accepts a client-supplied tenantId/userId — only the server-derived context is used", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getLatestAssistantChannelIdentityForUser.mockResolvedValue(null);
    issuePairingChallenge.mockResolvedValue({
      data: [{ identity_id: "identity-1", challenge_code: "ABCDEF", challenge_expires_at: "2026-08-11T10:00:00.000Z" }],
      error: null,
    });
    const { registerOwnerWhatsappNumberForActiveTenant } = await import("./service");

    await registerOwnerWhatsappNumberForActiveTenant({
      rawNumber: "081234567890",
      tenantId: "attacker-tenant",
      userId: "attacker-user",
    });

    expect(getLatestAssistantChannelIdentityForUser).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "owner-1",
      channel: "whatsapp",
    });
    expect(issuePairingChallenge).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      channel: "whatsapp",
      normalizedAddress: "+6281234567890",
    });
  });
});
