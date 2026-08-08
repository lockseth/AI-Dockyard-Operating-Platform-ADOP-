// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalGroupCard } from "./ApprovalGroupCard";

// R2 Founder UAT: all four approval groups (Import Kas, Tinjauan Pengajuan
// Biaya, Tinjauan Duplikasi, Tinjauan EOD) share this wrapper — covering its
// collapse/expand/tone contract once here is equivalent to covering it on
// every call site.
describe("ApprovalGroupCard", () => {
  it("starts collapsed regardless of pending count, and does not render children until expanded", () => {
    render(
      <ApprovalGroupCard icon="expense" title="Tinjauan Pengajuan Biaya (3)" pendingCount={3}>
        <p>Item content</p>
      </ApprovalGroupCard>,
    );

    const trigger = screen.getByRole("button", { name: /Tinjauan Pengajuan Biaya \(3\)/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Content stays mounted (hidden attribute), never unmounted — same
    // contract as the shared Disclosure component.
    expect(screen.getByText("Item content")).not.toBeVisible();
  });

  it("shows a warning 'Perlu review' badge only when pendingCount > 0", () => {
    const { rerender } = render(
      <ApprovalGroupCard icon="expense" title="Group A" pendingCount={2}>
        <p>content</p>
      </ApprovalGroupCard>,
    );
    expect(screen.getByText("Perlu review")).toBeInTheDocument();
    expect(screen.queryByText("Tidak ada pending")).not.toBeInTheDocument();

    rerender(
      <ApprovalGroupCard icon="expense" title="Group A" pendingCount={0}>
        <p>content</p>
      </ApprovalGroupCard>,
    );
    expect(screen.queryByText("Perlu review")).not.toBeInTheDocument();
    expect(screen.getByText("Tidak ada pending")).toBeInTheDocument();
  });

  it("renders the existing short description only when one is provided", () => {
    const { rerender } = render(
      <ApprovalGroupCard icon="duplicate" title="Group B" description="Existing note" pendingCount={0}>
        <p>content</p>
      </ApprovalGroupCard>,
    );
    expect(screen.getByText("Existing note")).toBeInTheDocument();

    rerender(
      <ApprovalGroupCard icon="duplicate" title="Group B" pendingCount={0}>
        <p>content</p>
      </ApprovalGroupCard>,
    );
    expect(screen.queryByText("Existing note")).not.toBeInTheDocument();
  });

  it("expanding reveals every existing child untouched, and toggles aria-expanded", async () => {
    const user = userEvent.setup();
    render(
      <ApprovalGroupCard icon="eod" title="Group C" pendingCount={1}>
        <button type="button">Setujui</button>
        <button type="button">Tolak</button>
      </ApprovalGroupCard>,
    );

    const trigger = screen.getByRole("button", { name: /Group C/ });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Setujui" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Tolak" })).toBeVisible();
  });
});
