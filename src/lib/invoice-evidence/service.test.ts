import { beforeEach, describe, expect, it, vi } from "vitest";

const requireTenantContext = vi.fn();
vi.mock("@/lib/auth/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/tenant")>();
  return { ...actual, requireTenantContext };
});

const listInvoices = vi.fn();
const getInvoiceSummary = vi.fn();
const listInvoiceTransactionLines = vi.fn();
const listInvoiceEvidenceVersions = vi.fn();
const listInvoiceEligibleTransactions = vi.fn();
const listTransactionInvoiceBindings = vi.fn();
const createDraftInvoice = vi.fn();
const bindInvoiceTransaction = vi.fn();
const finalizeInvoiceEvidenceVersion = vi.fn();
const getCurrentInvoiceEvidenceVersion = vi.fn();
const createInvoiceEvidenceSignedUrl = vi.fn();
vi.mock("./repository", () => ({
  listInvoices,
  getInvoiceSummary,
  listInvoiceTransactionLines,
  listInvoiceEvidenceVersions,
  listInvoiceEligibleTransactions,
  listTransactionInvoiceBindings,
  createDraftInvoice,
  bindInvoiceTransaction,
  unbindInvoiceTransaction: vi.fn(),
  issueInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  reissueInvoice: vi.fn(),
  finalizeInvoiceEvidenceVersion,
  getCurrentInvoiceEvidenceVersion,
  verifyInvoiceEvidenceVersion: vi.fn(),
  rejectInvoiceEvidenceVersion: vi.fn(),
  createInvoiceEvidenceSignedUrl,
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
const REVIEWER_CONTEXT = { ...OWNER_CONTEXT, roles: ["reviewer"] as const };

const VALID_INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ENTRY_ID = "22222222-2222-4222-8222-222222222222";
const VALID_HASH = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listInvoicesForActiveTenant", () => {
  it("rejects reviewer before ever calling the repository", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    const { listInvoicesForActiveTenant } = await import("./service");

    await expect(listInvoicesForActiveTenant()).rejects.toThrow(UnauthorizedTenantRoleError);
    expect(listInvoices).not.toHaveBeenCalled();
  });

  it("passes the active tenant id to the repository for owner", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    listInvoices.mockResolvedValue([{ id: VALID_INVOICE_ID }]);
    const { listInvoicesForActiveTenant } = await import("./service");

    const result = await listInvoicesForActiveTenant();

    expect(listInvoices).toHaveBeenCalledWith("tenant-1", undefined);
    expect(result).toEqual([{ id: VALID_INVOICE_ID }]);
  });
});

describe("getInvoiceDetailForActiveTenant", () => {
  it("returns null when the RPC reports 'invoice not found' — surfaces as a 404, not a thrown error", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getInvoiceSummary.mockResolvedValue({ data: null, error: { message: "invoice not found" } });
    const { getInvoiceDetailForActiveTenant } = await import("./service");

    const result = await getInvoiceDetailForActiveTenant(VALID_INVOICE_ID);

    expect(result).toBeNull();
    expect(listInvoiceTransactionLines).not.toHaveBeenCalled();
  });

  it("rethrows an unrelated error instead of silently returning null", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getInvoiceSummary.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    const { getInvoiceDetailForActiveTenant } = await import("./service");

    await expect(getInvoiceDetailForActiveTenant(VALID_INVOICE_ID)).rejects.toBeTruthy();
  });

  it("assembles invoice + lines + versions on success", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getInvoiceSummary.mockResolvedValue({ data: { id: VALID_INVOICE_ID, tenant_id: "tenant-1" }, error: null });
    listInvoiceTransactionLines.mockResolvedValue([{ id: "line-1" }]);
    listInvoiceEvidenceVersions.mockResolvedValue([{ id: "version-1" }]);
    const { getInvoiceDetailForActiveTenant } = await import("./service");

    const result = await getInvoiceDetailForActiveTenant(VALID_INVOICE_ID);

    expect(result).toEqual({
      invoice: { id: VALID_INVOICE_ID, tenant_id: "tenant-1" },
      lines: [{ id: "line-1" }],
      versions: [{ id: "version-1" }],
    });
  });
});

describe("listTransactionInvoiceBindingsForActiveTenant", () => {
  it("returns an empty array for a non-owner/admin role without calling the repository", async () => {
    requireTenantContext.mockResolvedValue(REVIEWER_CONTEXT);
    const { listTransactionInvoiceBindingsForActiveTenant } = await import("./service");

    const result = await listTransactionInvoiceBindingsForActiveTenant(VALID_ENTRY_ID);

    expect(result).toEqual([]);
    expect(listTransactionInvoiceBindings).not.toHaveBeenCalled();
  });
});

describe("bindInvoiceTransactionForActiveTenant", () => {
  it("returns fieldErrors for an invalid uuid without calling requireTenantContext", async () => {
    const { bindInvoiceTransactionForActiveTenant } = await import("./service");

    const result = await bindInvoiceTransactionForActiveTenant({ invoiceId: "not-a-uuid", transactionEntryId: VALID_ENTRY_ID });

    expect(result.fieldErrors).toBeTruthy();
    expect(requireTenantContext).not.toHaveBeenCalled();
    expect(bindInvoiceTransaction).not.toHaveBeenCalled();
  });

  it("maps an RPC error to an Indonesian message", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    bindInvoiceTransaction.mockResolvedValue({ error: { code: "P0001", message: "transaction entry is already bound to an active invoice" } });
    const { bindInvoiceTransactionForActiveTenant } = await import("./service");

    const result = await bindInvoiceTransactionForActiveTenant({ invoiceId: VALID_INVOICE_ID, transactionEntryId: VALID_ENTRY_ID });

    expect(result.error).toMatch(/terikat pada invoice aktif lain/);
  });
});

describe("finalizeInvoiceEvidenceVersionForActiveTenant — E-10 retry idempotency", () => {
  const input = {
    invoiceId: VALID_INVOICE_ID,
    storagePath: `${VALID_INVOICE_ID}/${VALID_INVOICE_ID}/a.pdf`,
    sha256: VALID_HASH,
    sizeBytes: 100,
    mimeType: "application/pdf",
  };

  it("returns the existing current version instead of finalizing again when sha256 matches", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getCurrentInvoiceEvidenceVersion.mockResolvedValue({ id: "version-current", sha256: VALID_HASH });
    const { finalizeInvoiceEvidenceVersionForActiveTenant } = await import("./service");

    const result = await finalizeInvoiceEvidenceVersionForActiveTenant(input);

    expect(result).toEqual({ versionId: "version-current", alreadyCurrent: true });
    expect(finalizeInvoiceEvidenceVersion).not.toHaveBeenCalled();
  });

  it("proceeds to finalize when there is no current version or the hash differs", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    getCurrentInvoiceEvidenceVersion.mockResolvedValue({ id: "version-old", sha256: "b".repeat(64) });
    finalizeInvoiceEvidenceVersion.mockResolvedValue({ data: { id: "version-new" }, error: null });
    const { finalizeInvoiceEvidenceVersionForActiveTenant } = await import("./service");

    const result = await finalizeInvoiceEvidenceVersionForActiveTenant(input);

    expect(finalizeInvoiceEvidenceVersion).toHaveBeenCalledWith(input);
    expect(result).toEqual({ versionId: "version-new" });
  });
});

describe("getInvoiceEvidenceSignedUrlForActiveTenant", () => {
  it("returns a generic error without leaking RPC details when the access RPC rejects", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createInvoiceEvidenceSignedUrl.mockResolvedValue({ data: null, error: { message: "not authorized to access invoice evidence" } });
    const { getInvoiceEvidenceSignedUrlForActiveTenant } = await import("./service");

    const result = await getInvoiceEvidenceSignedUrlForActiveTenant({ versionId: VALID_ENTRY_ID }, 60);

    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/not authorized/);
    expect(result.url).toBeUndefined();
  });

  it("returns the signed url on success", async () => {
    requireTenantContext.mockResolvedValue(OWNER_CONTEXT);
    createInvoiceEvidenceSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.local/signed" }, error: null });
    const { getInvoiceEvidenceSignedUrlForActiveTenant } = await import("./service");

    const result = await getInvoiceEvidenceSignedUrlForActiveTenant({ versionId: VALID_ENTRY_ID }, 60);

    expect(result).toEqual({ url: "https://example.local/signed" });
  });
});
