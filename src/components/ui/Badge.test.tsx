// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="success">READY</Badge>);
    expect(screen.getByText("READY")).toBeInTheDocument();
  });

  it("applies a distinct class per tone so every consumer shares the same token set", () => {
    const { rerender } = render(<Badge tone="success">A</Badge>);
    const successClass = screen.getByText("A").className;

    rerender(<Badge tone="danger">A</Badge>);
    const dangerClass = screen.getByText("A").className;

    expect(successClass).not.toBe(dangerClass);
    expect(successClass).toMatch(/emerald/);
    expect(dangerClass).toMatch(/red/);
  });

  // Visual Refinement R2 added an opt-in `hidden` prop (used by Owner
  // Control's reserved-badge-slot tiles). Every other Badge call site across
  // the app never passes it — these prove the default (hidden omitted)
  // never renders aria-hidden or the `invisible` class, so nothing else
  // that renders a Badge changes.
  it("never adds aria-hidden or the invisible class when `hidden` is omitted (default, every pre-existing call site)", () => {
    render(<Badge tone="warning">Perlu review</Badge>);
    const badge = screen.getByText("Perlu review");
    expect(badge).not.toHaveAttribute("aria-hidden");
    expect(badge.className.split(" ")).not.toContain("invisible");
  });

  it("adds aria-hidden and the invisible class only when `hidden` is explicitly true", () => {
    render(
      <Badge tone="warning" hidden>
        Perlu review
      </Badge>,
    );
    const badge = screen.getByText("Perlu review");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge.className.split(" ")).toContain("invisible");
  });
});
