import { describe, expect, it } from "vitest";
import { planIssuance } from "./issuance";
import type { ResolvedIssuanceState } from "./types";

describe("planIssuance", () => {
  it("creates a new tenant when none exists yet", () => {
    const state: ResolvedIssuanceState = {
      tenant: null,
      tenantHasActiveOwner: false,
      pendingTokenId: null,
    };
    expect(planIssuance(state)).toEqual({ kind: "create_tenant" });
  });

  it("reissues against an existing ownerless tenant, revoking any pending token", () => {
    const state: ResolvedIssuanceState = {
      tenant: { id: "tenant-1", displayName: "PT Contoh" },
      tenantHasActiveOwner: false,
      pendingTokenId: "token-old",
    };
    expect(planIssuance(state)).toEqual({
      kind: "reissue",
      tenantId: "tenant-1",
      revokeTokenId: "token-old",
    });
  });

  it("reissues with no revoke target when there is no pending token yet", () => {
    const state: ResolvedIssuanceState = {
      tenant: { id: "tenant-1", displayName: "PT Contoh" },
      tenantHasActiveOwner: false,
      pendingTokenId: null,
    };
    expect(planIssuance(state)).toEqual({
      kind: "reissue",
      tenantId: "tenant-1",
      revokeTokenId: null,
    });
  });

  it("fails closed when the tenant already has an active owner", () => {
    const state: ResolvedIssuanceState = {
      tenant: { id: "tenant-1", displayName: "PT Contoh" },
      tenantHasActiveOwner: true,
      pendingTokenId: null,
    };
    const result = planIssuance(state);
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.reason).toBe("tenant_already_has_owner");
    }
  });
});
