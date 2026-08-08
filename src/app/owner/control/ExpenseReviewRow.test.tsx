// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpenseReviewRow } from "./ExpenseReviewRow";
import { ExpenseReviewSection, type ExpenseReviewItem } from "./ExpenseReviewSection";
import type { ExpenseSubmissionCurrentRow } from "@/lib/expense-approvals/repository";

const approveExpenseSubmissionOwnerAction = vi.fn();
const rejectExpenseSubmissionOwnerAction = vi.fn();
const requestExpenseCorrectionOwnerAction = vi.fn();

vi.mock("@/lib/owner-control/actions", () => ({
  approveExpenseSubmissionOwnerAction: (...args: unknown[]) => approveExpenseSubmissionOwnerAction(...args),
  rejectExpenseSubmissionOwnerAction: (...args: unknown[]) => rejectExpenseSubmissionOwnerAction(...args),
  requestExpenseCorrectionOwnerAction: (...args: unknown[]) => requestExpenseCorrectionOwnerAction(...args),
}));

function submission(overrides: Partial<ExpenseSubmissionCurrentRow> = {}): ExpenseSubmissionCurrentRow {
  return {
    submission_id: "sub-1",
    tenant_id: "tenant-1",
    pool_id: "pool-1",
    project_id: "project-1",
    category_id: "category-1",
    vendor_id: null,
    amount: 250000,
    description: "Solar",
    reference_number: null,
    status: "submitted",
    revision_id: "rev-1",
    revision_number: 1,
    revision_created_at: "2026-07-20T00:00:00Z",
    revision_created_by: null,
    ledger_entry_id: null,
    created_at: "2026-07-20T00:00:00Z",
    created_by: null,
    updated_at: "2026-07-20T00:00:00Z",
    decided_at: null,
    decided_by: null,
    ...overrides,
  } as ExpenseSubmissionCurrentRow;
}

function item(overrides: Partial<ExpenseReviewItem> = {}): ExpenseReviewItem {
  return {
    submission: submission(),
    businessDate: "2026-07-20",
    projectLabel: "EDD Anchor Vessel A",
    categoryLabel: "BBM",
    vendorLabel: null,
    revisionHistory: [],
    duplicateCandidates: [],
    ...overrides,
  };
}

describe("ExpenseReviewRow — collapsed-by-default review row", () => {
  beforeEach(() => {
    approveExpenseSubmissionOwnerAction.mockReset().mockResolvedValue({});
    rejectExpenseSubmissionOwnerAction.mockReset().mockResolvedValue({});
    requestExpenseCorrectionOwnerAction.mockReset().mockResolvedValue({});
    cleanup();
  });

  it("collapses by default: identity/nominal/status/date visible, decision actions not yet in the DOM", () => {
    render(<ExpenseReviewRow item={item()} />);

    const trigger = screen.getByRole("button", { name: /EDD Anchor Vessel A/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/BBM/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?250\.000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();
  });

  it("expanding the row reveals the full existing approve/reject/correction actions", async () => {
    const user = userEvent.setup();
    render(<ExpenseReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /EDD Anchor Vessel A/ }));

    expect(screen.getByRole("button", { name: "Setujui" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tolak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minta Koreksi" })).toBeInTheDocument();
  });

  it("still calls the existing approve action when Setujui is confirmed after expanding", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ExpenseReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /EDD Anchor Vessel A/ }));
    await user.click(screen.getByRole("button", { name: "Setujui" }));

    expect(approveExpenseSubmissionOwnerAction).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("surfaces the pending-duplicate flag in the collapsed header (hasError badge) without opening the row", () => {
    render(
      <ExpenseReviewRow
        item={item({ duplicateCandidates: [{ status: "pending" } as never] })}
      />,
    );
    expect(screen.getByText("Cek Duplikasi Dulu")).toBeInTheDocument();
  });
});

describe("ExpenseReviewSection — full backlog renders, rows toggle independently", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the pending count in the header and renders every pending item, not a truncated preview", () => {
    const items = [
      item({ submission: submission({ submission_id: "sub-1" }), projectLabel: "Kapal 1" }),
      item({ submission: submission({ submission_id: "sub-2" }), projectLabel: "Kapal 2" }),
      item({ submission: submission({ submission_id: "sub-3" }), projectLabel: "Kapal 3" }),
    ];
    render(<ExpenseReviewSection items={items} />);

    expect(screen.getByText("2. Tinjauan Pengajuan Biaya (3)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kapal 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kapal 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kapal 3/ })).toBeInTheDocument();
  });

  it("opening one row does not expand or otherwise affect a sibling row", async () => {
    const user = userEvent.setup();
    const items = [
      item({ submission: submission({ submission_id: "sub-1" }), projectLabel: "Kapal 1" }),
      item({ submission: submission({ submission_id: "sub-2" }), projectLabel: "Kapal 2" }),
    ];
    render(<ExpenseReviewSection items={items} />);

    await user.click(screen.getByRole("button", { name: /Kapal 1/ }));

    expect(screen.getByRole("button", { name: /Kapal 1/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Kapal 2/ })).toHaveAttribute("aria-expanded", "false");
  });
});
