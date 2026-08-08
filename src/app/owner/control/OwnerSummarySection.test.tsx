// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OwnerSummarySection } from "./OwnerSummarySection";
import type { ActiveProjectCostRow, OwnerControlSummary } from "@/lib/owner-control/view-model";

const BASE_SUMMARY: OwnerControlSummary = {
  openingCash: 0,
  totalCashIn: 0,
  totalCashOutApproved: 0,
  expectedClosingCash: 0,
  dailyCloseStatus: null,
  expensesPendingReviewCount: 0,
  duplicateCandidatesPendingCount: 0,
  eodReconciliationStatus: null,
  activeProjectCount: 0,
};

function projectRow(index: number, totalCost: number): ActiveProjectCostRow {
  return { projectId: `project-${index}`, label: `Kapal ${index}`, totalCost };
}

// Regression coverage for the Gate 3B wiring gap: buildUnbilledVesselIndicator
// was already fully unit-tested (owner-control/view-model.test.ts) but was
// never rendered by Owner Control — this proves the page's own presentation
// layer (not just the pure function) shows/hides the indicator correctly.
describe("OwnerSummarySection — unbilled attention card", () => {
  it("renders the Kapal Belum Ditagihkan card, amount, and link when count > 0", () => {
    render(
      <OwnerSummarySection
        summary={BASE_SUMMARY}
        activeProjectCostRows={[]}
        unbilledIndicator={{ count: 2, amountTotal: 3_500_000 }}
      />,
    );

    expect(screen.getByText("Kapal Belum Ditagihkan")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?3\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText("Kapal Belum Ditagihkan").closest("a")).toHaveAttribute("href", "/billing/workspace");
  });

  it("never shows the card when the indicator is a zero-value result (no false alert)", () => {
    render(
      <OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={[]} unbilledIndicator={{ count: 0, amountTotal: 0 }} />,
    );
    expect(screen.queryByText("Kapal Belum Ditagihkan")).not.toBeInTheDocument();
  });

  it("never shows the card when the indicator is null (role cannot access Billing Workspace)", () => {
    render(<OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={[]} unbilledIndicator={null} />);
    expect(screen.queryByText("Kapal Belum Ditagihkan")).not.toBeInTheDocument();
  });
});

// Regression coverage for the "49 proyek" once-glance gap: Section 1 must
// never render the full active-project list by default.
describe("OwnerSummarySection — bounded Project Kapal Aktif preview", () => {
  it("renders every row unbounded when there are 5 or fewer", () => {
    const rows = [projectRow(1, 100), projectRow(2, 200), projectRow(3, 300)];
    render(<OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={rows} unbilledIndicator={null} />);

    expect(screen.getByText("Kapal 1")).toBeInTheDocument();
    expect(screen.getByText("Kapal 2")).toBeInTheDocument();
    expect(screen.getByText("Kapal 3")).toBeInTheDocument();
    expect(screen.queryByText(/Menampilkan/)).not.toBeInTheDocument();
  });

  it("caps the list at 5 highest-cost rows and links to the full Project Kapal page when there are more", () => {
    const rows = Array.from({ length: 49 }, (_, i) => projectRow(i, i));
    render(<OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={rows} unbilledIndicator={null} />);

    // Highest-cost rows (48..44) shown; a low-cost row (e.g. Kapal 0) is not.
    expect(screen.getByText("Kapal 48")).toBeInTheDocument();
    expect(screen.getByText("Kapal 44")).toBeInTheDocument();
    expect(screen.queryByText("Kapal 0")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Kapal \d+$/)).toHaveLength(5);

    expect(screen.getByText("Menampilkan 5 dari 49 Project Kapal aktif (biaya tertinggi lebih dulu).")).toBeInTheDocument();
    expect(screen.getByText("Lihat Semua Project")).toHaveAttribute("href", "/app/vessel-projects");
  });
});
