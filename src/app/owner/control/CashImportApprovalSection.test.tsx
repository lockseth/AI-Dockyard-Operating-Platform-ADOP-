// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashImportApprovalSection } from "./CashImportApprovalSection";
import type { CashImportBatchRow } from "@/lib/cash-import-staging/repository";

function batch(overrides: Partial<CashImportBatchRow> = {}): CashImportBatchRow {
  return {
    id: "batch-1",
    status: "ready_for_review",
    source_filename: "laporan-kas.xlsx",
    business_date: "2026-07-20",
    ...overrides,
  } as CashImportBatchRow;
}

// R2: this group used to return null entirely at zero pending — now it
// always renders collapsed, consistent with the other three approval
// groups, so the visible group count on Owner Control is always four.
describe("CashImportApprovalSection", () => {
  it("still renders (collapsed) even when there are zero pending batches, instead of hiding entirely", () => {
    render(<CashImportApprovalSection batches={[]} />);
    expect(screen.getByRole("button", { name: /Import Kas Menunggu Persetujuan \(0\)/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("Tidak ada pending")).toBeInTheDocument();
  });

  it("only counts ready_for_review batches, ignoring other statuses", () => {
    render(
      <CashImportApprovalSection
        batches={[batch({ id: "b1", status: "ready_for_review" }), batch({ id: "b2", status: "committed" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Import Kas Menunggu Persetujuan \(1\)/ })).toBeInTheDocument();
  });

  it("expanding the group reveals every pending batch with its existing Review & Setujui link, route unchanged", async () => {
    const user = userEvent.setup();
    render(<CashImportApprovalSection batches={[batch({ id: "batch-42" })]} />);

    await user.click(screen.getByRole("button", { name: /Import Kas Menunggu Persetujuan/ }));

    expect(screen.getByText("laporan-kas.xlsx")).toBeVisible();
    expect(screen.getByText("Review & Setujui")).toHaveAttribute("href", "/operations/import/batch-42");
  });
});
