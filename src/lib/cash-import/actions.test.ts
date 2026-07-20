import { describe, expect, it, vi } from "vitest";
import { buildWorkbookBuffer, HEADER_ROW, isoDateToExcelSerial } from "./test-helpers";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", () => ({
  requireTenantContext: () => requireTenantContext(),
}));

const { analyzeCashReportUploadAction } = await import("./actions");

function tenantContextWithRoles(roles: string[]) {
  return {
    userId: "user-1",
    email: "user@example.test",
    tenantId: "tenant-1",
    tenantDisplayName: "Tenant",
    membershipId: "membership-1",
    roles,
    legalEntities: [],
  };
}

function buildUploadFormData(): FormData {
  const serial = isoDateToExcelSerial("2026-01-05");
  const buffer = buildWorkbookBuffer([
    HEADER_ROW,
    [{ v: serial }, null, null, null, null, { v: 1_000_000 }],
    [null, { v: "Setoran" }, { v: "Kas" }, { v: 100_000 }, null, { v: 1_100_000 }],
  ]);
  const formData = new FormData();
  formData.set("file", new File([new Uint8Array(buffer)], "laporan.xlsx"));
  return formData;
}

describe("analyzeCashReportUploadAction — server-side role gate", () => {
  it("allows admin and returns a parsed dry-run analysis", async () => {
    requireTenantContext.mockResolvedValueOnce(tenantContextWithRoles(["admin"]));
    const result = await analyzeCashReportUploadAction(null, buildUploadFormData());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.isDryRun).toBe(true);
  });

  it("rejects owner — owner does not perform import per Gate 1J-A lock", async () => {
    requireTenantContext.mockResolvedValueOnce(tenantContextWithRoles(["owner"]));
    const result = await analyzeCashReportUploadAction(null, buildUploadFormData());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("forbidden" in result && result.forbidden).toBe(true);
  });

  it("rejects a role with no import access (reviewer/viewer)", async () => {
    requireTenantContext.mockResolvedValueOnce(tenantContextWithRoles(["viewer"]));
    const result = await analyzeCashReportUploadAction(null, buildUploadFormData());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("forbidden" in result && result.forbidden).toBe(true);
  });

  it("rejects a submission with no file", async () => {
    requireTenantContext.mockResolvedValueOnce(tenantContextWithRoles(["admin"]));
    const result = await analyzeCashReportUploadAction(null, new FormData());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect("fileError" in result && result.fileError.code).toBe("WRONG_FORMAT");
  });
});
