import { describe, expect, it } from "vitest";
import { containsForbiddenOwnerLiteral, DEMO_TENANT_IDENTITY } from "./identity";

describe("containsForbiddenOwnerLiteral", () => {
  it("detects the literal name in various casings", () => {
    expect(containsForbiddenOwnerLiteral("Hanafi")).toBe(true);
    expect(containsForbiddenOwnerLiteral("hanafi")).toBe(true);
    expect(containsForbiddenOwnerLiteral("Pak Hanafi")).toBe(true);
    expect(containsForbiddenOwnerLiteral("HANAFI Demo Owner")).toBe(true);
  });

  it("allows ordinary internal Founder owner names", () => {
    expect(containsForbiddenOwnerLiteral("Founder Demo Owner")).toBe(false);
    expect(containsForbiddenOwnerLiteral("Internal Admin")).toBe(false);
  });
});

describe("DEMO_TENANT_IDENTITY", () => {
  it("locks the tenant identity to the design partner's legal name", () => {
    expect(DEMO_TENANT_IDENTITY.displayName).toBe("PT PELAYARAN GEMA BAHARI");
    expect(DEMO_TENANT_IDENTITY.legalName).toBe("PT PELAYARAN GEMA BAHARI");
  });

  it("does not use the forbidden owner literal for the tenant identity itself", () => {
    expect(containsForbiddenOwnerLiteral(DEMO_TENANT_IDENTITY.displayName)).toBe(false);
  });
});
