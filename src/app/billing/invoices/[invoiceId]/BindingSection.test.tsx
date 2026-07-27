// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const bindInvoiceTransactionAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
const unbindInvoiceTransactionAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));
vi.mock("@/lib/invoice-evidence/actions", () => ({
  bindInvoiceTransactionAction: (...args: [unknown, FormData]) => bindInvoiceTransactionAction(...args),
  unbindInvoiceTransactionAction: (...args: [unknown, FormData]) => unbindInvoiceTransactionAction(...args),
}));

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("BindingSection — empty eligible-transactions guidance", () => {
  it("explains the closed-project requirement and links to Project Kapal when nothing is eligible", async () => {
    const { BindingSection } = await import("./BindingSection");
    render(<BindingSection invoiceId={INVOICE_ID} invoiceStatus="draft" lines={[]} eligibleTransactions={[]} />);

    expect(screen.getByText(/statusnya sudah/)).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Buka Project Kapal/ });
    expect(link).toHaveAttribute("href", "/app/vessel-projects");
  });

  it("does not show the empty-eligible guidance once at least one transaction can be bound", async () => {
    const { BindingSection } = await import("./BindingSection");
    render(
      <BindingSection
        invoiceId={INVOICE_ID}
        invoiceStatus="draft"
        lines={[]}
        eligibleTransactions={[
          {
            transaction_entry_id: "22222222-2222-4222-8222-222222222222",
            description: "Docking",
            amount: 1000000,
            vessel_name: "KM Test",
            project_code: "PRJ-1",
          } as never,
        ]}
      />,
    );

    expect(screen.queryByText(/statusnya sudah/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Tambah Transaksi Closed/ })).toBeInTheDocument();
  });
});
