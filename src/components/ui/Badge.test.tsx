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
});
