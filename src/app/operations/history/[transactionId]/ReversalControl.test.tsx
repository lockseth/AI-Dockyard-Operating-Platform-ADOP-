// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReversalControl } from "./ReversalControl";
import type { TrustedTransactionRow } from "@/lib/transaction-history/types";

const reverseCashPoolEntryAction = vi.fn();
const reverseProjectExpenseAction = vi.fn();
const reversePairedProjectRefundAction = vi.fn();

vi.mock("@/lib/cash-pool/actions", () => ({
  reverseCashPoolEntryAction: (...args: unknown[]) => reverseCashPoolEntryAction(...args),
}));
vi.mock("@/lib/cost-ledger/actions", () => ({
  reverseProjectExpenseAction: (...args: unknown[]) => reverseProjectExpenseAction(...args),
}));
vi.mock("@/lib/paired-refund-reversal/actions", () => ({
  reversePairedProjectRefundAction: (...args: unknown[]) => reversePairedProjectRefundAction(...args),
}));

function makeTransaction(overrides: Partial<TrustedTransactionRow> = {}): TrustedTransactionRow {
  return {
    actor_user_id: "user-1",
    business_date: "2026-07-21",
    cash_entry_id: "cash-entry-1",
    cash_reverses_entry_id: null,
    cost_entry_id: null,
    cost_reverses_entry_id: null,
    created_at: "2026-07-21T00:00:00Z",
    description: null,
    display_amount: 500000,
    import_batch_id: null,
    import_row_id: null,
    logical_transaction_id: "txn-1",
    pool_id: "pool-1",
    project_code: null,
    project_id: null,
    reference_number: null,
    reversal_of_logical_id: null,
    reversed_by_logical_id: null,
    signed_cash_effect: 500000,
    signed_project_cost_effect: null,
    signed_shared_overhead_effect: null,
    source: "direct_manual",
    status: "active",
    tenant_id: "tenant-1",
    transaction_direction: "cash_in",
    transaction_type: "opening_cash",
    vessel_name: null,
    ...overrides,
  };
}

describe("ReversalControl — routing, role-gating, and reason-required confirmation", () => {
  beforeEach(() => {
    reverseCashPoolEntryAction.mockReset().mockResolvedValue({});
    reverseProjectExpenseAction.mockReset().mockResolvedValue({});
    reversePairedProjectRefundAction.mockReset().mockResolvedValue({});
    cleanup();
  });

  it("renders nothing for viewer/reviewer roles even on an active cash_pool transaction", () => {
    render(<ReversalControl transaction={makeTransaction()} viewerRoles={["viewer"]} />);
    expect(screen.queryByRole("button", { name: "Koreksi via Reversal" })).not.toBeInTheDocument();
  });

  it("shows the button for admin on a cash_pool-type transaction", () => {
    render(<ReversalControl transaction={makeTransaction()} viewerRoles={["admin"]} />);
    expect(screen.getByRole("button", { name: "Koreksi via Reversal" })).toBeInTheDocument();
  });

  it("hides the button for admin on a project_refund (paired) transaction — owner-only", () => {
    render(
      <ReversalControl
        transaction={makeTransaction({ transaction_type: "project_refund", cost_entry_id: "cost-entry-1" })}
        viewerRoles={["admin"]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Koreksi via Reversal" })).not.toBeInTheDocument();
  });

  it("shows the button for owner on a project_refund transaction", () => {
    render(
      <ReversalControl
        transaction={makeTransaction({ transaction_type: "project_refund", cost_entry_id: "cost-entry-1" })}
        viewerRoles={["owner"]}
      />,
    );
    expect(screen.getByRole("button", { name: "Koreksi via Reversal" })).toBeInTheDocument();
  });

  it("explains that an already-reversed transaction cannot be reversed again, and shows no button", () => {
    render(<ReversalControl transaction={makeTransaction({ status: "reversed" })} viewerRoles={["owner"]} />);
    expect(screen.getByText(/sudah direversal sebelumnya/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Koreksi via Reversal" })).not.toBeInTheDocument();
  });

  it("explains that a reversal-type row itself cannot be reversed, and shows no button", () => {
    render(<ReversalControl transaction={makeTransaction({ status: "reversal" })} viewerRoles={["owner"]} />);
    expect(screen.getByText(/Ini adalah transaksi reversal/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Koreksi via Reversal" })).not.toBeInTheDocument();
  });

  it("requires a non-empty reason before the confirm button is enabled, and does not call the action on cancel", async () => {
    const user = userEvent.setup();
    render(<ReversalControl transaction={makeTransaction()} viewerRoles={["owner"]} />);

    await user.click(screen.getByRole("button", { name: "Koreksi via Reversal" }));
    const confirmButton = screen.getByRole("button", { name: "Konfirmasi Reversal" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Alasan koreksi/), "Salah input nominal");
    expect(confirmButton).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByText("Konfirmasi Reversal")).not.toBeInTheDocument();
    expect(reverseCashPoolEntryAction).not.toHaveBeenCalled();
  });

  it("calls reverseCashPoolEntryAction for an opening_cash transaction after confirmation", async () => {
    const user = userEvent.setup();
    render(<ReversalControl transaction={makeTransaction()} viewerRoles={["owner"]} />);

    await user.click(screen.getByRole("button", { name: "Koreksi via Reversal" }));
    await user.type(screen.getByLabelText(/Alasan koreksi/), "Salah input nominal");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Reversal" }));

    expect(reverseCashPoolEntryAction).toHaveBeenCalledTimes(1);
    expect(reverseProjectExpenseAction).not.toHaveBeenCalled();
    expect(reversePairedProjectRefundAction).not.toHaveBeenCalled();
  });

  it("calls reverseProjectExpenseAction for a project_expense transaction after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ReversalControl
        transaction={makeTransaction({ transaction_type: "project_expense", cash_entry_id: null, cost_entry_id: "cost-entry-1" })}
        viewerRoles={["admin"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Koreksi via Reversal" }));
    await user.type(screen.getByLabelText(/Alasan koreksi/), "Kategori salah");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Reversal" }));

    expect(reverseProjectExpenseAction).toHaveBeenCalledTimes(1);
    expect(reverseCashPoolEntryAction).not.toHaveBeenCalled();
  });

  it("calls reversePairedProjectRefundAction (atomic, both legs) for a project_refund transaction after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ReversalControl
        transaction={makeTransaction({ transaction_type: "project_refund", cost_entry_id: "cost-entry-1" })}
        viewerRoles={["owner"]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Koreksi via Reversal" }));
    await user.type(screen.getByLabelText(/Alasan koreksi/), "Refund keliru dicatat");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Reversal" }));

    expect(reversePairedProjectRefundAction).toHaveBeenCalledTimes(1);
    expect(reverseCashPoolEntryAction).not.toHaveBeenCalled();
    expect(reverseProjectExpenseAction).not.toHaveBeenCalled();
  });
});
