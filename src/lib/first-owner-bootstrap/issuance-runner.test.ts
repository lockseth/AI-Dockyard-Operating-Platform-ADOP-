import { describe, expect, it, vi } from "vitest";
import { runIssuance } from "./issuance-runner";
import type { IssuanceRepository } from "./issuance-repository";
import type { IssuanceInput, ResolvedIssuanceState } from "./types";

function fakeRepository(overrides: Partial<IssuanceRepository> & { state: ResolvedIssuanceState }): IssuanceRepository {
  return {
    resolveState: vi.fn(async () => overrides.state),
    createTenant: overrides.createTenant ?? vi.fn(async () => ({ id: "new-tenant-id" })),
    revokeToken: overrides.revokeToken ?? vi.fn(async () => {}),
    issueToken:
      overrides.issueToken ??
      vi.fn(async (tenantId: string) => ({
        tenantId,
        tokenId: "token-id",
        rawToken: "raw-token-value",
        expiresAt: "2026-01-01T00:00:00.000Z",
      })),
    writeIssuedAuditEvent: overrides.writeIssuedAuditEvent ?? vi.fn(async () => {}),
  };
}

const INPUT: IssuanceInput = {
  tenantSlug: "pt-contoh",
  tenantDisplayName: "PT Contoh",
  email: "owner@contoh.test",
};

describe("runIssuance", () => {
  it("dry-run never calls any write method", async () => {
    const repo = fakeRepository({ state: { tenant: null, tenantHasActiveOwner: false, pendingTokenId: null } });
    const report = await runIssuance(repo, INPUT, false, 72, "http://localhost:3000");
    expect(report).toEqual({ kind: "dry_run", plan: { kind: "create_tenant" } });
    expect(repo.createTenant).not.toHaveBeenCalled();
    expect(repo.issueToken).not.toHaveBeenCalled();
  });

  it("apply on a brand-new slug creates the tenant then issues a token and writes the audit event", async () => {
    const repo = fakeRepository({ state: { tenant: null, tenantHasActiveOwner: false, pendingTokenId: null } });
    const report = await runIssuance(repo, INPUT, true, 24, "http://localhost:3000/");

    expect(repo.createTenant).toHaveBeenCalledWith(INPUT);
    expect(repo.revokeToken).not.toHaveBeenCalled();
    expect(repo.issueToken).toHaveBeenCalledWith("new-tenant-id", INPUT.email, expect.any(Date));
    expect(repo.writeIssuedAuditEvent).toHaveBeenCalledWith("new-tenant-id", "token-id", INPUT.email);
    expect(report).toEqual({
      kind: "issued",
      tenantId: "new-tenant-id",
      tokenId: "token-id",
      claimUrl: "http://localhost:3000/onboarding/first-owner/raw-token-value",
      expiresAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("apply on an existing ownerless tenant with a pending token revokes it before issuing a new one", async () => {
    const repo = fakeRepository({
      state: {
        tenant: { id: "existing-tenant", displayName: "PT Contoh" },
        tenantHasActiveOwner: false,
        pendingTokenId: "stale-token-id",
      },
    });
    await runIssuance(repo, INPUT, true, 72, "http://localhost:3000");

    expect(repo.createTenant).not.toHaveBeenCalled();
    expect(repo.revokeToken).toHaveBeenCalledWith("stale-token-id");
    expect(repo.issueToken).toHaveBeenCalledWith("existing-tenant", INPUT.email, expect.any(Date));
  });

  it("refuses (no writes at all) when the tenant already has an active owner, dry-run or apply", async () => {
    const repo = fakeRepository({
      state: {
        tenant: { id: "owned-tenant", displayName: "PT Sudah Ada Owner" },
        tenantHasActiveOwner: true,
        pendingTokenId: null,
      },
    });

    const dryRunReport = await runIssuance(repo, INPUT, false, 72, "http://localhost:3000");
    expect(dryRunReport.kind).toBe("conflict");

    const applyReport = await runIssuance(repo, INPUT, true, 72, "http://localhost:3000");
    expect(applyReport.kind).toBe("conflict");

    expect(repo.createTenant).not.toHaveBeenCalled();
    expect(repo.revokeToken).not.toHaveBeenCalled();
    expect(repo.issueToken).not.toHaveBeenCalled();
    expect(repo.writeIssuedAuditEvent).not.toHaveBeenCalled();
  });
});
