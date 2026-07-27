import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const createDraftInvoiceForActiveTenant = vi.fn();
const bindInvoiceTransactionForActiveTenant = vi.fn();
const unbindInvoiceTransactionForActiveTenant = vi.fn();
const issueInvoiceForActiveTenant = vi.fn();
const voidInvoiceForActiveTenant = vi.fn();
const reissueInvoiceForActiveTenant = vi.fn();
const finalizeInvoiceEvidenceVersionForActiveTenant = vi.fn();
const verifyInvoiceEvidenceVersionForActiveTenant = vi.fn();
const rejectInvoiceEvidenceVersionForActiveTenant = vi.fn();
const getInvoiceEvidenceSignedUrlForActiveTenant = vi.fn();
const updateInvoiceBillingMetadataForActiveTenant = vi.fn();
vi.mock("./service", () => ({
  createDraftInvoiceForActiveTenant,
  bindInvoiceTransactionForActiveTenant,
  unbindInvoiceTransactionForActiveTenant,
  issueInvoiceForActiveTenant,
  voidInvoiceForActiveTenant,
  reissueInvoiceForActiveTenant,
  finalizeInvoiceEvidenceVersionForActiveTenant,
  verifyInvoiceEvidenceVersionForActiveTenant,
  rejectInvoiceEvidenceVersionForActiveTenant,
  getInvoiceEvidenceSignedUrlForActiveTenant,
  updateInvoiceBillingMetadataForActiveTenant,
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDraftInvoiceAction", () => {
  it("redirects to the new invoice's detail page on success", async () => {
    createDraftInvoiceForActiveTenant.mockResolvedValue({ invoiceId: INVOICE_ID });
    const { createDraftInvoiceAction } = await import("./actions");

    await createDraftInvoiceAction({}, new FormData());

    expect(revalidatePath).toHaveBeenCalledWith("/billing/invoices");
    expect(redirectMock).toHaveBeenCalledWith(`/billing/invoices/${INVOICE_ID}`);
  });

  it("returns the error and does not redirect on failure", async () => {
    createDraftInvoiceForActiveTenant.mockResolvedValue({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
    const { createDraftInvoiceAction } = await import("./actions");

    const result = await createDraftInvoiceAction({}, new FormData());

    expect(result.error).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("maps a thrown UnauthorizedTenantRoleError to an Indonesian permission message", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    createDraftInvoiceForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());
    const { createDraftInvoiceAction } = await import("./actions");

    const result = await createDraftInvoiceAction({}, new FormData());

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
  });
});

describe("bindInvoiceTransactionAction", () => {
  it("revalidates the invoice detail page after a successful bind", async () => {
    bindInvoiceTransactionForActiveTenant.mockResolvedValue({});
    const { bindInvoiceTransactionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);
    formData.set("transactionEntryId", "entry-1");

    await bindInvoiceTransactionAction({}, formData);

    expect(revalidatePath).toHaveBeenCalledWith(`/billing/invoices/${INVOICE_ID}`);
  });

  it("does not revalidate when the bind fails", async () => {
    bindInvoiceTransactionForActiveTenant.mockResolvedValue({ error: "Transaksi ini sudah terikat pada invoice aktif lain." });
    const { bindInvoiceTransactionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);
    formData.set("transactionEntryId", "entry-1");

    const result = await bindInvoiceTransactionAction({}, formData);

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateInvoiceBillingMetadataAction", () => {
  it("revalidates the detail, list, and workspace pages after a successful save", async () => {
    updateInvoiceBillingMetadataForActiveTenant.mockResolvedValue({});
    const { updateInvoiceBillingMetadataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);
    formData.set("legalEntityId", "22222222-2222-4222-8222-222222222222");
    formData.set("invoiceNumber", "INV-001");
    formData.set("invoiceDate", "2029-01-01");
    formData.set("dueDate", "2029-01-31");

    await updateInvoiceBillingMetadataAction({}, formData);

    expect(updateInvoiceBillingMetadataForActiveTenant).toHaveBeenCalledWith({
      invoiceId: INVOICE_ID,
      legalEntityId: "22222222-2222-4222-8222-222222222222",
      invoiceNumber: "INV-001",
      invoiceDate: "2029-01-01",
      dueDate: "2029-01-31",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/billing/invoices/${INVOICE_ID}`);
    expect(revalidatePath).toHaveBeenCalledWith("/billing/invoices");
    expect(revalidatePath).toHaveBeenCalledWith("/billing/workspace");
  });

  it("does not revalidate when the save fails", async () => {
    updateInvoiceBillingMetadataForActiveTenant.mockResolvedValue({ error: "Nomor invoice ini sudah terdaftar untuk legal entity ini." });
    const { updateInvoiceBillingMetadataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);

    const result = await updateInvoiceBillingMetadataAction({}, formData);

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a thrown UnauthorizedTenantRoleError to an Indonesian permission message", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    updateInvoiceBillingMetadataForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());
    const { updateInvoiceBillingMetadataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);

    const result = await updateInvoiceBillingMetadataAction({}, formData);

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
  });
});

describe("issueInvoiceAction", () => {
  it("revalidates both the detail page and the list page on success", async () => {
    issueInvoiceForActiveTenant.mockResolvedValue({});
    const { issueInvoiceAction } = await import("./actions");
    const formData = new FormData();
    formData.set("invoiceId", INVOICE_ID);

    await issueInvoiceAction({}, formData);

    expect(revalidatePath).toHaveBeenCalledWith(`/billing/invoices/${INVOICE_ID}`);
    expect(revalidatePath).toHaveBeenCalledWith("/billing/invoices");
  });
});

describe("reissueInvoiceAction", () => {
  it("redirects to the newly reissued invoice", async () => {
    reissueInvoiceForActiveTenant.mockResolvedValue({ invoiceId: "22222222-2222-4222-8222-222222222222" });
    const { reissueInvoiceAction } = await import("./actions");
    const formData = new FormData();
    formData.set("predecessorInvoiceId", INVOICE_ID);

    await reissueInvoiceAction({}, formData);

    expect(redirectMock).toHaveBeenCalledWith("/billing/invoices/22222222-2222-4222-8222-222222222222");
  });
});

describe("finalizeInvoiceEvidenceVersionAction", () => {
  it("revalidates the invoice detail page when a version is created or already current", async () => {
    finalizeInvoiceEvidenceVersionForActiveTenant.mockResolvedValue({ versionId: "version-1", alreadyCurrent: true });
    const { finalizeInvoiceEvidenceVersionAction } = await import("./actions");

    const result = await finalizeInvoiceEvidenceVersionAction({
      invoiceId: INVOICE_ID,
      storagePath: "path",
      sha256: "a".repeat(64),
      sizeBytes: 10,
      mimeType: "application/pdf",
    });

    expect(result.alreadyCurrent).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith(`/billing/invoices/${INVOICE_ID}`);
  });

  it("does not revalidate when finalize fails (orphaned storage object is a documented limitation)", async () => {
    finalizeInvoiceEvidenceVersionForActiveTenant.mockResolvedValue({ error: "Format file tidak didukung." });
    const { finalizeInvoiceEvidenceVersionAction } = await import("./actions");

    const result = await finalizeInvoiceEvidenceVersionAction({
      invoiceId: INVOICE_ID,
      storagePath: "path",
      sha256: "a".repeat(64),
      sizeBytes: 10,
      mimeType: "application/pdf",
    });

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("getInvoiceEvidenceSignedUrlAction", () => {
  it("returns the url from the service layer", async () => {
    getInvoiceEvidenceSignedUrlForActiveTenant.mockResolvedValue({ url: "https://example.local/signed" });
    const { getInvoiceEvidenceSignedUrlAction } = await import("./actions");

    const result = await getInvoiceEvidenceSignedUrlAction("version-1");

    expect(result).toEqual({ url: "https://example.local/signed" });
  });

  it("maps a thrown UnauthorizedTenantRoleError instead of leaking it to the client", async () => {
    const { UnauthorizedTenantRoleError } = await import("@/lib/auth/tenant");
    getInvoiceEvidenceSignedUrlForActiveTenant.mockRejectedValueOnce(new UnauthorizedTenantRoleError());
    const { getInvoiceEvidenceSignedUrlAction } = await import("./actions");

    const result = await getInvoiceEvidenceSignedUrlAction("version-1");

    expect(result).toEqual({ error: "Anda tidak memiliki izin untuk melakukan aksi ini." });
  });
});
