import { describe, expect, it } from "vitest";
import { resolvePrimaryIdentity } from "./identity";

describe("resolvePrimaryIdentity", () => {
  it("uses the legal entity's legal_name and logo_path when present", () => {
    const identity = resolvePrimaryIdentity(
      [{ id: "le-1", displayName: "Legal Entity A", legalName: "PT PELAYARAN GEMA BAHARI", logoPath: "/branding/logo.png" }],
      "Tenant A",
    );
    expect(identity).toEqual({ legalName: "PT PELAYARAN GEMA BAHARI", logoPath: "/branding/logo.png" });
  });

  it("falls back to legal entity display_name when legal_name is not set yet", () => {
    const identity = resolvePrimaryIdentity(
      [{ id: "le-2", displayName: "Legal Entity B — TBD", legalName: null, logoPath: null }],
      "Tenant B",
    );
    expect(identity).toEqual({ legalName: "Legal Entity B — TBD", logoPath: null });
  });

  it("falls back to tenantDisplayName when there is no legal entity at all", () => {
    const identity = resolvePrimaryIdentity([], "Tenant C");
    expect(identity).toEqual({ legalName: "Tenant C", logoPath: null });
  });

  it("never fabricates a logo when logoPath is null", () => {
    const identity = resolvePrimaryIdentity(
      [{ id: "le-3", displayName: "Legal Entity C", legalName: "PT Contoh", logoPath: null }],
      "Tenant C",
    );
    expect(identity.logoPath).toBeNull();
  });
});
