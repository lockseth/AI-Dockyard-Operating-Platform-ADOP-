// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateInvoiceBillingMetadataAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
vi.mock("@/lib/invoice-evidence/actions", () => ({
  updateInvoiceBillingMetadataAction: (...args: [unknown, FormData]) => updateInvoiceBillingMetadataAction(...args),
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const LEGAL_ENTITY_ID = "22222222-2222-4222-8222-222222222222";

const LEGAL_ENTITY_OPTIONS = [{ id: LEGAL_ENTITY_ID, displayName: "PT CONTOH TENANT" }];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("MetadataSection", () => {
  it("renders the four metadata fields, prefilled, for a draft invoice", async () => {
    const { MetadataSection } = await import("./MetadataSection");
    render(
      <MetadataSection
        invoiceId={INVOICE_ID}
        invoiceStatus="draft"
        legalEntityId={LEGAL_ENTITY_ID}
        invoiceNumber="INV-001"
        invoiceDate="2029-01-01"
        dueDate="2029-01-31"
        legalEntityOptions={LEGAL_ENTITY_OPTIONS}
      />,
    );

    expect(screen.getByLabelText(/legal entity/i)).toHaveValue(LEGAL_ENTITY_ID);
    expect(screen.getByLabelText(/nomor invoice/i)).toHaveValue("INV-001");
    expect(screen.getByLabelText(/tanggal invoice/i)).toHaveValue("2029-01-01");
    expect(screen.getByLabelText(/tanggal jatuh tempo/i)).toHaveValue("2029-01-31");
    expect(screen.getByRole("button", { name: /simpan metadata/i })).toBeInTheDocument();
  });

  it("does not render for a non-draft invoice — metadata is locked outside draft", async () => {
    const { MetadataSection } = await import("./MetadataSection");
    const { container } = render(
      <MetadataSection
        invoiceId={INVOICE_ID}
        invoiceStatus="issued"
        legalEntityId={LEGAL_ENTITY_ID}
        invoiceNumber="INV-001"
        invoiceDate="2029-01-01"
        dueDate="2029-01-31"
        legalEntityOptions={LEGAL_ENTITY_OPTIONS}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.selectOptions(screen.getByLabelText(/legal entity/i), LEGAL_ENTITY_ID);
    await user.type(screen.getByLabelText(/nomor invoice/i), "INV-001");
    await user.type(screen.getByLabelText(/tanggal invoice/i), "2029-01-01");
    await user.type(screen.getByLabelText(/tanggal jatuh tempo/i), "2028-12-31");
  }

  it("shows a field-level validation error returned by the action", async () => {
    updateInvoiceBillingMetadataAction.mockResolvedValueOnce({
      fieldErrors: { dueDate: ["Tanggal jatuh tempo tidak boleh sebelum tanggal invoice."] },
    });
    const user = userEvent.setup();
    const { MetadataSection } = await import("./MetadataSection");
    render(
      <MetadataSection
        invoiceId={INVOICE_ID}
        invoiceStatus="draft"
        legalEntityId={null}
        invoiceNumber={null}
        invoiceDate={null}
        dueDate={null}
        legalEntityOptions={LEGAL_ENTITY_OPTIONS}
      />,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /simpan metadata/i }));

    expect(await screen.findByText(/tidak boleh sebelum tanggal invoice/i)).toBeInTheDocument();
  });

  it("submits successfully and clears any prior error", async () => {
    updateInvoiceBillingMetadataAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    const { MetadataSection } = await import("./MetadataSection");
    render(
      <MetadataSection
        invoiceId={INVOICE_ID}
        invoiceStatus="draft"
        legalEntityId={null}
        invoiceNumber={null}
        invoiceDate={null}
        dueDate={null}
        legalEntityOptions={LEGAL_ENTITY_OPTIONS}
      />,
    );

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /simpan metadata/i }));

    await vi.waitFor(() => expect(updateInvoiceBillingMetadataAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
