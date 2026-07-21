// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashEntryForm } from "./CashEntryForm";

const recordCashPoolEntryAction = vi.fn();

vi.mock("@/lib/operations-daily/actions", () => ({
  recordCashPoolEntryAction: (...args: unknown[]) => recordCashPoolEntryAction(...args),
}));

// Proves the LOCK's saldo-awal safety invariants at the component level:
// entering an amount never posts by itself, only an explicit second
// (confirm) click calls the server action, cancelling never calls it, and a
// fresh mount (the nav-away-and-back / refresh case) always starts clean
// with zero prior calls.
describe("CashEntryForm — opening_cash confirmation flow", () => {
  beforeEach(() => {
    recordCashPoolEntryAction.mockReset();
    recordCashPoolEntryAction.mockResolvedValue({});
    cleanup();
  });

  function renderOpeningCashForm() {
    return render(
      <CashEntryForm
        poolId="pool-1"
        entryType="opening_cash"
        label="Catat Opening Cash"
        disabled={false}
        businessDate="2026-07-21"
      />,
    );
  }

  it("does not call the server action merely by filling in the amount", async () => {
    const user = userEvent.setup();
    renderOpeningCashForm();

    await user.type(screen.getByLabelText("Nominal Catat Opening Cash"), "500000");

    expect(recordCashPoolEntryAction).not.toHaveBeenCalled();
  });

  it("a fresh mount (nav-away-and-back / refresh) never has a pending post", () => {
    renderOpeningCashForm();
    expect(recordCashPoolEntryAction).not.toHaveBeenCalled();
    expect(screen.queryByText("Konfirmasi Saldo Awal")).not.toBeInTheDocument();
  });

  it("shows the confirmation summary (date + nominal + append-only warning) before posting, without calling the action yet", async () => {
    const user = userEvent.setup();
    renderOpeningCashForm();

    await user.type(screen.getByLabelText("Nominal Catat Opening Cash"), "500000");
    await user.click(screen.getByRole("button", { name: "Tinjau & Konfirmasi" }));

    expect(screen.getByText("Konfirmasi Saldo Awal")).toBeInTheDocument();
    expect(screen.getByText(/append-only/)).toBeInTheDocument();
    expect(screen.getByText(/reversal/)).toBeInTheDocument();
    expect(recordCashPoolEntryAction).not.toHaveBeenCalled();
  });

  it("cancelling the confirmation never calls the server action", async () => {
    const user = userEvent.setup();
    renderOpeningCashForm();

    await user.type(screen.getByLabelText("Nominal Catat Opening Cash"), "500000");
    await user.click(screen.getByRole("button", { name: "Tinjau & Konfirmasi" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByText("Konfirmasi Saldo Awal")).not.toBeInTheDocument();
    expect(recordCashPoolEntryAction).not.toHaveBeenCalled();
  });

  it("posts exactly once after explicit confirmation", async () => {
    const user = userEvent.setup();
    renderOpeningCashForm();

    await user.type(screen.getByLabelText("Nominal Catat Opening Cash"), "500000");
    await user.click(screen.getByRole("button", { name: "Tinjau & Konfirmasi" }));
    await user.click(screen.getByRole("button", { name: "Konfirmasi & Posting" }));

    expect(recordCashPoolEntryAction).toHaveBeenCalledTimes(1);
  });

  it("the confirm button disables immediately on click, so a double-click cannot double-post", async () => {
    let resolveAction: (value: Record<string, never>) => void = () => {};
    recordCashPoolEntryAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    renderOpeningCashForm();

    await user.type(screen.getByLabelText("Nominal Catat Opening Cash"), "500000");
    await user.click(screen.getByRole("button", { name: "Tinjau & Konfirmasi" }));
    const confirmButton = screen.getByRole("button", { name: "Konfirmasi & Posting" });
    await user.click(confirmButton);
    expect(confirmButton).toBeDisabled();

    // A second click while the first submission is still pending must not
    // fire a second call — the button is disabled precisely to prevent it.
    await user.click(confirmButton);
    expect(recordCashPoolEntryAction).toHaveBeenCalledTimes(1);

    resolveAction({});
  });

  it("cash_top_up entries are unaffected — no confirmation step, single-click submit", async () => {
    const user = userEvent.setup();
    render(<CashEntryForm poolId="pool-1" entryType="cash_top_up" label="Tambah Cash Top-Up" disabled={false} />);

    await user.type(screen.getByLabelText("Nominal Tambah Cash Top-Up"), "100000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(recordCashPoolEntryAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Konfirmasi Saldo Awal")).not.toBeInTheDocument();
  });
});
