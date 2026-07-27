// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InvoiceDeliveryEventRow } from "@/lib/invoice-delivery/types";

const recordInvoiceDeliveryAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
const recordInvoiceAcknowledgmentAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
vi.mock("@/lib/invoice-delivery/actions", () => ({
  recordInvoiceDeliveryAction: (...args: [unknown, FormData]) => recordInvoiceDeliveryAction(...args),
  recordInvoiceAcknowledgmentAction: (...args: [unknown, FormData]) => recordInvoiceAcknowledgmentAction(...args),
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

function sentEvent(overrides: Partial<InvoiceDeliveryEventRow> = {}): InvoiceDeliveryEventRow {
  return {
    id: "event-1",
    event_seq: 1,
    tenant_id: "tenant-1",
    invoice_id: INVOICE_ID,
    channel: "email",
    event_type: "sent",
    recipient_snapshot: "pic@client.co",
    provider_reference: null,
    failure_reason: null,
    acknowledgment_note: null,
    recorded_by: "user-1",
    created_at: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("DeliverySection — empty/loading/error states", () => {
  it("shows the empty state when there are no events yet", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[]} />);
    expect(screen.getByText(/Belum ada pengiriman yang tercatat/)).toBeInTheDocument();
  });

  it("shows an error callout when loadError is true, and hides the rest of the section", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[]} loadError />);
    expect(screen.getByText(/Gagal memuat riwayat pengiriman/)).toBeInTheDocument();
    expect(screen.queryByText(/Belum ada pengiriman/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat Pengiriman" })).not.toBeInTheDocument();
  });

  it("does not render either recording form when the invoice is not issued", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="draft" events={[]} />);
    expect(screen.getByText(/hanya dapat dicatat setelah invoice diterbitkan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat Pengiriman" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat Diterima" })).not.toBeInTheDocument();
  });
});

describe("DeliverySection — Catat Pengiriman / Catat Diterima gating", () => {
  it("renders 'Catat Pengiriman' but not 'Catat Diterima' when no event has been recorded yet", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[]} />);

    expect(screen.getByRole("button", { name: "Catat Pengiriman" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat Diterima" })).not.toBeInTheDocument();
  });

  it("renders both actions once a 'sent' event exists", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[sentEvent()]} />);

    expect(screen.getByRole("button", { name: "Catat Pengiriman" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Catat Diterima" })).toBeInTheDocument();
  });

  it("hides both recording forms once the latest event is 'acknowledged' (terminal)", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(
      <DeliverySection
        invoiceId={INVOICE_ID}
        invoiceStatus="issued"
        events={[sentEvent({ id: "event-2", event_type: "acknowledged" }), sentEvent()]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Catat Pengiriman" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Catat Diterima" })).not.toBeInTheDocument();
    expect(screen.getByText(/sudah tercatat diterima/)).toBeInTheDocument();
  });

  it("shows the latest-status card and the full history timeline", async () => {
    const { DeliverySection } = await import("./DeliverySection");
    render(
      <DeliverySection
        invoiceId={INVOICE_ID}
        invoiceStatus="issued"
        events={[sentEvent({ id: "event-2", event_type: "delivered" }), sentEvent()]}
      />,
    );

    expect(screen.getByText("Status Terbaru:")).toBeInTheDocument();
    expect(screen.getAllByText("Delivered").length).toBeGreaterThan(0);
    expect(screen.getByText("Riwayat Pengiriman")).toBeInTheDocument();
    expect(screen.getAllByText("pic@client.co").length).toBeGreaterThan(0);
  });

  it("submits Catat Pengiriman with a failed status only after a failure reason is filled in", async () => {
    const user = userEvent.setup();
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[]} />);

    await user.selectOptions(screen.getByLabelText("Status"), "failed");
    expect(screen.getByLabelText(/Alasan Gagal/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Penerima/), "0812xxxx");
    await user.type(screen.getByLabelText(/Alasan Gagal/), "Nomor tidak aktif");
    await user.click(screen.getByRole("button", { name: "Catat Pengiriman" }));

    await waitFor(() => expect(recordInvoiceDeliveryAction).toHaveBeenCalledTimes(1));
  });

  it("submits Catat Diterima with the invoiceId and channel wired through", async () => {
    const user = userEvent.setup();
    const { DeliverySection } = await import("./DeliverySection");
    render(<DeliverySection invoiceId={INVOICE_ID} invoiceStatus="issued" events={[sentEvent()]} />);

    await user.type(screen.getAllByLabelText(/Penerima/)[1], "Pak Budi");
    await user.click(screen.getByRole("button", { name: "Catat Diterima" }));

    await waitFor(() => expect(recordInvoiceAcknowledgmentAction).toHaveBeenCalledTimes(1));
    const formData = recordInvoiceAcknowledgmentAction.mock.calls[0][1] as FormData;
    expect(formData.get("invoiceId")).toBe(INVOICE_ID);
  });
});
