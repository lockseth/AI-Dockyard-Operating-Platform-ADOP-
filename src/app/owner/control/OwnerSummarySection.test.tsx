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

// TailAdmin-inspired restyle: the plain <dl> summary rows were replaced with
// a StatCard KPI grid + status Badge row — this proves every pre-existing
// summary field still renders somewhere on the page, just in the new shape.
describe("OwnerSummarySection — executive summary KPI cards", () => {
  it("renders every existing summary field with its existing formatted value", () => {
    render(
      <OwnerSummarySection
        summary={{
          ...BASE_SUMMARY,
          openingCash: 1_000_000,
          totalCashIn: 250_000,
          totalCashOutApproved: 400_000,
          expectedClosingCash: 850_000,
          expensesPendingReviewCount: 3,
          duplicateCandidatesPendingCount: 1,
          activeProjectCount: 7,
        }}
        activeProjectCostRows={[]}
        unbilledIndicator={null}
      />,
    );

    expect(screen.getByText("Saldo Awal")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?1\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("Total Kas Masuk")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?250\.000/)).toBeInTheDocument();
    expect(screen.getByText("Total Kas Keluar Disetujui")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?400\.000/)).toBeInTheDocument();
    expect(screen.getByText("Perkiraan Saldo Akhir")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?850\.000/)).toBeInTheDocument();
    expect(screen.getByText("Pengeluaran Menunggu Review")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Kandidat Duplikasi Pending")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Proyek Kapal Aktif")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows a visible 'Perlu review' badge only on pending-count cards with a count > 0 — the other tiles keep a hidden badge slot so all three tiles stay the same height", () => {
    render(
      <OwnerSummarySection
        summary={{ ...BASE_SUMMARY, expensesPendingReviewCount: 0, duplicateCandidatesPendingCount: 2 }}
        activeProjectCostRows={[]}
        unbilledIndicator={null}
      />,
    );
    const badges = screen.getAllByText("Perlu review");
    expect(badges).toHaveLength(3);
    const visible = badges.filter((badge) => !badge.className.includes("invisible"));
    expect(visible).toHaveLength(1);
    const hidden = badges.filter((badge) => badge.className.includes("invisible"));
    expect(hidden).toHaveLength(2);
    // Reserved-but-unused badges must be pulled out of the accessibility
    // tree, not just styled invisible.
    hidden.forEach((badge) => expect(badge).toHaveAttribute("aria-hidden", "true"));
    expect(visible[0]).not.toHaveAttribute("aria-hidden");
  });

  it("renders the daily-close and EOD reconciliation status as badges using the existing label functions", () => {
    render(
      <OwnerSummarySection
        summary={{ ...BASE_SUMMARY, dailyCloseStatus: "open", eodReconciliationStatus: "submitted" }}
        activeProjectCostRows={[]}
        unbilledIndicator={null}
      />,
    );
    expect(screen.getByText(/Kas:/)).toBeInTheDocument();
    expect(screen.getByText(/EOD:/)).toBeInTheDocument();
  });
});

// R2 Founder UAT: the three owner action indicators (Pengeluaran Menunggu
// Review, Kandidat Duplikasi Pending, Project Kapal Aktif) now double as
// quick-jump links — proves the routes/anchors are the existing ones, not
// invented destinations.
describe("OwnerSummarySection — action indicator routes", () => {
  it("links Pengeluaran Menunggu Review and Kandidat Duplikasi Pending to their existing in-page sections", () => {
    render(<OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={[]} unbilledIndicator={null} />);

    expect(screen.getByText("Pengeluaran Menunggu Review").closest("a")).toHaveAttribute("href", "#tinjauan-biaya");
    expect(screen.getByText("Kandidat Duplikasi Pending").closest("a")).toHaveAttribute("href", "#tinjauan-duplikasi");
  });

  it("links Proyek Kapal Aktif to the existing unbounded Project Kapal list", () => {
    render(<OwnerSummarySection summary={BASE_SUMMARY} activeProjectCostRows={[]} unbilledIndicator={null} />);

    expect(screen.getByText("Proyek Kapal Aktif").closest("a")).toHaveAttribute("href", "/app/vessel-projects");
  });
});

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
describe("OwnerSummarySection — bounded Proyek Kapal Aktif preview", () => {
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

    expect(screen.getByText("Menampilkan 5 dari 49 Proyek Kapal aktif (biaya tertinggi lebih dulu).")).toBeInTheDocument();
    expect(screen.getByText("Lihat Semua Proyek")).toHaveAttribute("href", "/app/vessel-projects");
  });
});
