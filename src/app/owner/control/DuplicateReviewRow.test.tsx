// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DuplicateReviewRow } from "./DuplicateReviewRow";
import { DuplicateReviewSection, type DuplicateReviewItem } from "./DuplicateReviewSection";
import type { ExpenseDuplicateCandidateCurrentRow } from "@/lib/expense-duplicate-detection/repository";

const resolveExpenseDuplicateCandidateOwnerAction = vi.fn();

vi.mock("@/lib/owner-control/actions", () => ({
  resolveExpenseDuplicateCandidateOwnerAction: (...args: unknown[]) =>
    resolveExpenseDuplicateCandidateOwnerAction(...args),
}));

function candidate(overrides: Partial<ExpenseDuplicateCandidateCurrentRow> = {}): ExpenseDuplicateCandidateCurrentRow {
  return {
    candidate_id: "cand-1",
    tenant_id: "tenant-1",
    reason_code: "same_day_amount_vendor_match",
    status: "pending",
    amount_1: 250000,
    amount_2: 250000,
    submission_id_1: "sub-1",
    submission_id_2: "sub-2",
    project_id_1: "project-1",
    project_id_2: "project-1",
    category_id_1: "category-1",
    category_id_2: "category-1",
    vendor_id_1: null,
    vendor_id_2: null,
    description_1: "Solar",
    description_2: "Solar",
    reference_number_1: null,
    reference_number_2: null,
    submission_status_1: "submitted",
    submission_status_2: "submitted",
    revision_number_1: 1,
    revision_number_2: 1,
    detected_at: "2026-07-20T00:00:00Z",
    resolved_at: null,
    resolved_by: null,
    resolved_reason: null,
    match_evidence: {},
    ...overrides,
  } as ExpenseDuplicateCandidateCurrentRow;
}

function item(overrides: Partial<DuplicateReviewItem> = {}): DuplicateReviewItem {
  return {
    candidate: candidate(),
    businessDate1: "2026-07-20",
    businessDate2: "2026-07-20",
    projectLabel1: "EDD Anchor Vessel A",
    projectLabel2: "EDD Anchor Vessel A",
    categoryLabel1: "BBM",
    categoryLabel2: "BBM",
    vendorLabel1: null,
    vendorLabel2: null,
    ...overrides,
  };
}

describe("DuplicateReviewRow — collapsed-by-default review row", () => {
  beforeEach(() => {
    resolveExpenseDuplicateCandidateOwnerAction.mockReset().mockResolvedValue({});
    cleanup();
  });

  it("collapses by default: reason/projects/nominal/status visible, decision actions not yet in the DOM", () => {
    render(<DuplicateReviewRow item={item()} />);

    const trigger = screen.getByRole("button", { name: /EDD Anchor Vessel A vs EDD Anchor Vessel A/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/pending/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bukan Duplikat" })).not.toBeInTheDocument();
  });

  it("expanding the row reveals the full existing side-by-side comparison and decision actions", async () => {
    const user = userEvent.setup();
    render(<DuplicateReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /vs/ }));

    expect(screen.getByText("Sisi 1 · EDD Anchor Vessel A")).toBeInTheDocument();
    expect(screen.getByText("Sisi 2 · EDD Anchor Vessel A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bukan Duplikat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terkonfirmasi Duplikat" })).toBeInTheDocument();
  });

  it("still calls the existing resolution action when a decision is confirmed after expanding", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DuplicateReviewRow item={item()} />);

    await user.click(screen.getByRole("button", { name: /vs/ }));
    await user.click(screen.getByRole("button", { name: "Bukan Duplikat" }));
    await user.type(screen.getByLabelText("Alasan Keputusan"), "Beda transaksi, kebetulan sama");
    await user.click(screen.getByRole("button", { name: "Konfirmasi Keputusan" }));

    expect(resolveExpenseDuplicateCandidateOwnerAction).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe("DuplicateReviewSection — full backlog renders, rows toggle independently", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the pending count in the header and renders every pending candidate", async () => {
    const user = userEvent.setup();
    const items = [
      item({ candidate: candidate({ candidate_id: "cand-1" }), projectLabel1: "Kapal 1" }),
      item({ candidate: candidate({ candidate_id: "cand-2" }), projectLabel1: "Kapal 2" }),
    ];
    render(<DuplicateReviewSection items={items} />);

    // Group-level collapse (R2): the section itself starts collapsed —
    // open it before its item rows are reachable.
    expect(screen.getByRole("button", { name: /3\. Tinjauan Kandidat Duplikasi \(2\)/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await user.click(screen.getByRole("button", { name: /3\. Tinjauan Kandidat Duplikasi \(2\)/ }));

    expect(screen.getByRole("button", { name: /Kapal 1 vs/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kapal 2 vs/ })).toBeInTheDocument();
  });

  it("opening one row does not expand or otherwise affect a sibling row", async () => {
    const user = userEvent.setup();
    const items = [
      item({ candidate: candidate({ candidate_id: "cand-1" }), projectLabel1: "Kapal 1" }),
      item({ candidate: candidate({ candidate_id: "cand-2" }), projectLabel1: "Kapal 2" }),
    ];
    render(<DuplicateReviewSection items={items} />);

    await user.click(screen.getByRole("button", { name: /3\. Tinjauan Kandidat Duplikasi \(2\)/ }));
    await user.click(screen.getByRole("button", { name: /Kapal 1 vs/ }));

    expect(screen.getByRole("button", { name: /Kapal 1 vs/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Kapal 2 vs/ })).toHaveAttribute("aria-expanded", "false");
  });
});
