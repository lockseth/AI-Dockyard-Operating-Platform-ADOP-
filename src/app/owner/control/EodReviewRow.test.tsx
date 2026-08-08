// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EodReviewRow } from "./EodReviewRow";
import { EodReviewSection, type EodReviewItem } from "./EodReviewSection";
import type { CashPoolReconciliationCurrentRow } from "@/lib/cash-reconciliation/repository";

const approveCashReconciliationOwnerAction = vi.fn();
const rejectCashReconciliationOwnerAction = vi.fn();
const requestCashReconciliationCorrectionOwnerAction = vi.fn();
const reopenCashPoolOwnerAction = vi.fn();

vi.mock("@/lib/owner-control/actions", () => ({
  approveCashReconciliationOwnerAction: (...args: unknown[]) => approveCashReconciliationOwnerAction(...args),
  rejectCashReconciliationOwnerAction: (...args: unknown[]) => rejectCashReconciliationOwnerAction(...args),
  requestCashReconciliationCorrectionOwnerAction: (...args: unknown[]) =>
    requestCashReconciliationCorrectionOwnerAction(...args),
  reopenCashPoolOwnerAction: (...args: unknown[]) => reopenCashPoolOwnerAction(...args),
}));

function reconciliation(
  overrides: Partial<CashPoolReconciliationCurrentRow> = {},
): CashPoolReconciliationCurrentRow {
  return {
    reconciliation_id: "recon-1",
    tenant_id: "tenant-1",
    pool_id: "pool-1",
    business_date: "2026-07-20",
    pool_daily_close_status: "open",
    pool_financial_version: 1,
    status: "submitted",
    current_revision_id: "recon-rev-1",
    revision_number: 1,
    actual_counted_cash: 500000,
    explanation: null,
    created_by: null,
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-20T00:00:00Z",
    submitted_by: null,
    submitted_opening_cash: 400000,
    submitted_cash_top_up: 100000,
    submitted_other_cash_in: 0,
    submitted_total_cash_out: 0,
    submitted_expected_closing_cash: 500000,
    submitted_variance: 0,
    submitted_financial_version: 1,
    submitted_at: "2026-07-20T01:00:00Z",
    is_stale: false,
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    superseded_at: null,
    superseded_by_reopen_event_id: null,
    ...overrides,
  } as CashPoolReconciliationCurrentRow;
}

function item(overrides: Partial<EodReviewItem> = {}): EodReviewItem {
  return {
    reconciliation: reconciliation(),
    isLatestForPool: true,
    unresolvedExpenseCount: 0,
    ...overrides,
  };
}

describe("EodReviewRow — collapsed-by-default review row", () => {
  beforeEach(() => {
    approveCashReconciliationOwnerAction.mockReset().mockResolvedValue({});
    rejectCashReconciliationOwnerAction.mockReset().mockResolvedValue({});
    requestCashReconciliationCorrectionOwnerAction.mockReset().mockResolvedValue({});
    reopenCashPoolOwnerAction.mockReset().mockResolvedValue({});
    cleanup();
  });

  it("collapses by default: date/status/expected-closing visible, decision actions not yet in the DOM", () => {
    render(<EodReviewRow item={item()} />);

    const trigger = screen.getByRole("button", { name: /20 Juli 2026/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(within(trigger).getByText(/Rp\s?500\.000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setujui Penutupan" })).not.toBeInTheDocument();
  });

  it("expanding the row reveals the full existing decision detail and actions", async () => {
    const user = userEvent.setup();
    render(<EodReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /20 Juli 2026/ }));

    expect(screen.getByText("Opening Cash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Setujui Penutupan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tolak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Koreksi" })).toBeInTheDocument();
  });

  it("still calls the existing approve action when Setujui Penutupan is confirmed after expanding", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<EodReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /20 Juli 2026/ }));
    await user.click(screen.getByRole("button", { name: "Setujui Penutupan" }));

    expect(approveCashReconciliationOwnerAction).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("surfaces the unresolved-expense blocker in the collapsed header (hasError badge) without opening the row", () => {
    render(<EodReviewRow item={item({ unresolvedExpenseCount: 2 })} />);
    expect(screen.getByText("Ada Pengajuan Belum Selesai")).toBeInTheDocument();
  });
});

describe("EodReviewSection — full backlog renders, rows toggle independently", () => {
  beforeEach(() => {
    cleanup();
  });

  it("counts only pending (latest + submitted) reconciliations in the header, but still renders historical rows", async () => {
    const user = userEvent.setup();
    const items = [
      item({ reconciliation: reconciliation({ reconciliation_id: "recon-1", business_date: "2026-07-20" }) }),
      item({
        reconciliation: reconciliation({ reconciliation_id: "recon-2", business_date: "2026-07-19", status: "approved" }),
        isLatestForPool: false,
      }),
    ];
    render(<EodReviewSection items={items} />);

    // Group-level collapse (R2): the section itself starts collapsed —
    // open it before its item rows are reachable.
    expect(
      screen.getByRole("button", { name: /4\. Tinjauan Rekonsiliasi Akhir Hari \(EOD\) \(1\)/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: /4\. Tinjauan Rekonsiliasi Akhir Hari \(EOD\) \(1\)/ }));

    expect(screen.getByRole("button", { name: /20 Juli 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /19 Juli 2026/ })).toBeInTheDocument();
  });

  it("opening one row does not expand or otherwise affect a sibling row", async () => {
    const user = userEvent.setup();
    const items = [
      item({ reconciliation: reconciliation({ reconciliation_id: "recon-1", business_date: "2026-07-20" }) }),
      item({ reconciliation: reconciliation({ reconciliation_id: "recon-2", business_date: "2026-07-19" }) }),
    ];
    render(<EodReviewSection items={items} />);

    await user.click(screen.getByRole("button", { name: /4\. Tinjauan Rekonsiliasi Akhir Hari \(EOD\)/ }));
    await user.click(screen.getByRole("button", { name: /20 Juli 2026/ }));

    expect(screen.getByRole("button", { name: /20 Juli 2026/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /19 Juli 2026/ })).toHaveAttribute("aria-expanded", "false");
  });
});
