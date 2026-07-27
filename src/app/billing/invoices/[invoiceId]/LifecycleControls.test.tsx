// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const issueInvoiceAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
const voidInvoiceAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
const reissueInvoiceAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
vi.mock("@/lib/invoice-evidence/actions", () => ({
  issueInvoiceAction: (...args: [unknown, FormData]) => issueInvoiceAction(...args),
  voidInvoiceAction: (...args: [unknown, FormData]) => voidInvoiceAction(...args),
  reissueInvoiceAction: (...args: [unknown, FormData]) => reissueInvoiceAction(...args),
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("LifecycleControls", () => {
  it("disables 'Terbitkan Invoice' when the draft has no bound transactions", async () => {
    const { LifecycleControls } = await import("./LifecycleControls");
    render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="draft" lineCount={0} metadataComplete={true} hasSuccessor={false} />,
    );

    expect(screen.getByRole("button", { name: /terbitkan invoice/i })).toBeDisabled();
    expect(screen.getByText(/ikat minimal satu transaksi/i)).toBeInTheDocument();
  });

  it("disables 'Terbitkan Invoice' when transactions are bound but billing metadata is incomplete", async () => {
    const { LifecycleControls } = await import("./LifecycleControls");
    render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="draft" lineCount={2} metadataComplete={false} hasSuccessor={false} />,
    );

    expect(screen.getByRole("button", { name: /terbitkan invoice/i })).toBeDisabled();
    expect(screen.getByText(/lengkapi legal entity/i)).toBeInTheDocument();
  });

  it("enables 'Terbitkan Invoice' once at least one transaction is bound and metadata is complete, and shows a void trigger", async () => {
    const { LifecycleControls } = await import("./LifecycleControls");
    render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="draft" lineCount={2} metadataComplete={true} hasSuccessor={false} />,
    );

    expect(screen.getByRole("button", { name: /terbitkan invoice/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /batalkan draft/i })).toBeInTheDocument();
  });

  it("requires a non-empty reason before the void confirmation can be submitted", async () => {
    const user = userEvent.setup();
    const { LifecycleControls } = await import("./LifecycleControls");
    render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="issued" lineCount={1} metadataComplete={true} hasSuccessor={false} />,
    );

    await user.click(screen.getByRole("button", { name: /void invoice/i }));
    const confirmButton = screen.getByRole("button", { name: /konfirmasi void/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/alasan void/i), "salah nominal");
    expect(confirmButton).toBeEnabled();
  });

  it("shows a Reissue action for a void invoice with no successor yet", async () => {
    const { LifecycleControls } = await import("./LifecycleControls");
    render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="void" lineCount={0} metadataComplete={false} hasSuccessor={false} />,
    );

    expect(screen.getByRole("button", { name: /reissue invoice/i })).toBeInTheDocument();
  });

  it("renders nothing for a void invoice that has already been reissued", async () => {
    const { LifecycleControls } = await import("./LifecycleControls");
    const { container } = render(
      <LifecycleControls invoiceId={INVOICE_ID} invoiceStatus="void" lineCount={0} metadataComplete={false} hasSuccessor={true} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
