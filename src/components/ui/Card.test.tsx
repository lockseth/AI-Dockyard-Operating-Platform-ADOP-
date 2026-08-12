// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./Card";

// Visual Refinement R2 added an optional `icon` prop to StatCard (used by
// Owner Control's Executive Report). These tests prove it is genuinely
// opt-in: the 6+ other StatCard call sites across the app (dashboard, EOD
// close, billing workspace, daily operations) never pass `icon`, and must
// render exactly as before.
describe("StatCard — icon prop stays opt-in", () => {
  it("renders no icon chip when `icon` is omitted (every pre-existing call site)", () => {
    render(<StatCard eyebrow="Opening Cash" value="Rp 1.000.000" note="Terhitung sistem" />);

    expect(screen.getByText("Opening Cash")).toBeInTheDocument();
    expect(screen.getByText("Rp 1.000.000")).toBeInTheDocument();
    expect(screen.getByText("Terhitung sistem")).toBeInTheDocument();
    // No icon container should exist in the DOM at all when icon is omitted.
    expect(document.querySelector('[aria-hidden] svg')).not.toBeInTheDocument();
    expect(document.querySelector(".bg-adop-accent-100")).not.toBeInTheDocument();
  });

  it("renders no note block when `note` is omitted, same as before the icon prop existed", () => {
    render(<StatCard eyebrow="Project Kapal Aktif" value={48} />);
    expect(screen.getByText("Project Kapal Aktif")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.queryByText("Terhitung sistem")).not.toBeInTheDocument();
  });

  it("renders a soft-indigo icon chip only when `icon` is explicitly passed", () => {
    render(<StatCard eyebrow="Project Kapal Aktif" value={48} icon={<svg data-testid="kpi-icon" />} />);
    expect(screen.getByTestId("kpi-icon")).toBeInTheDocument();
    expect(document.querySelector(".bg-adop-accent-100")).toBeInTheDocument();
  });
});
