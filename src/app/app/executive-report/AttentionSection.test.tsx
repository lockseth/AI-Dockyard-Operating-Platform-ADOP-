// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AttentionSection } from "./AttentionSection";
import type { ExecutiveAttentionItem } from "@/lib/executive-report/types";

function item(overrides: Partial<ExecutiveAttentionItem> = {}): ExecutiveAttentionItem {
  return {
    projectId: "project-1",
    label: "IBM Anchor Vessel",
    tags: ["NOT_ACKNOWLEDGED"],
    amount: 0,
    traceUrl: "/billing/workspace/project-1",
    ...overrides,
  };
}

// Founder Visual UAT closeout: rows previously carried a real (if
// unintentional) underline — TextLink's base `underline` class was winning
// the Tailwind cascade over the row's own `no-underline`, just masked by the
// old full-amber row background. Fixed with a scoped `!no-underline`
// override on the row link only; these tests lock in that the row keeps its
// real destination and doesn't regress into losing the override again
// unnoticed (jsdom has no CSS engine, so this asserts the class token is
// present — the cascade-win itself was verified live in-browser).
describe("AttentionSection — row link styling and destination", () => {
  it("renders the row as a link to the item's traceUrl with a scoped underline override, not TextLink's default", () => {
    render(<AttentionSection items={[item()]} />);

    const link = screen.getByRole("link", { name: /IBM Anchor Vessel/ });
    expect(link).toHaveAttribute("href", "/billing/workspace/project-1");

    const classes = link.className.split(" ");
    expect(classes).toContain("!no-underline");
    // TextLink's own default-tone underline utility must still be present in
    // the class list (proves we didn't touch the shared component) — the
    // `!` modifier is what wins the cascade, not removing the base class.
    expect(classes).toContain("underline");
  });

  it("keeps hover/focus-visible affordance classes from the shared TextLink untouched", () => {
    render(<AttentionSection items={[item()]} />);
    const link = screen.getByRole("link", { name: /IBM Anchor Vessel/ });
    expect(link.className).toMatch(/focus-visible:ring-2/);
    expect(link.className).toMatch(/focus-visible:ring-blue-500/);
  });

  it("still renders label, tags, and amount for each row (no data/business-logic regression)", () => {
    render(
      <AttentionSection
        items={[item({ tags: ["UNBILLED", "DRAFT_INCOMPLETE"], amount: 250_000 })]}
      />,
    );
    expect(screen.getByText("IBM Anchor Vessel")).toBeInTheDocument();
    expect(screen.getByText("Belum Ditagih")).toBeInTheDocument();
    expect(screen.getByText("Draft Belum Lengkap")).toBeInTheDocument();
    expect(screen.getByText(/250\.000/)).toBeInTheDocument();
  });

  it("still caps the preview at 5 items and keeps the Billing Workspace link untouched", () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      item({ projectId: `project-${i}`, traceUrl: `/billing/workspace/project-${i}` }),
    );
    render(<AttentionSection items={items} />);
    expect(screen.getAllByRole("link", { name: /IBM Anchor Vessel/ })).toHaveLength(5);
    expect(screen.getByText(/Menampilkan 5 dari 7 item/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lihat Semua di Billing Workspace" })).toHaveAttribute(
      "href",
      "/billing/workspace",
    );
  });
});
