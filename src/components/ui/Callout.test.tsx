// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout } from "./Callout";

describe("Callout", () => {
  it("renders a title and children", () => {
    render(
      <Callout tone="danger" title="Konfirmasi Reversal">
        <p>Detail di sini</p>
      </Callout>,
    );
    expect(screen.getByText("Konfirmasi Reversal")).toBeInTheDocument();
    expect(screen.getByText("Detail di sini")).toBeInTheDocument();
  });

  it("applies a distinct class per tone so every consumer shares the same token set", () => {
    const { container: dangerContainer } = render(<Callout tone="danger">x</Callout>);
    const { container: warningContainer } = render(<Callout tone="warning">x</Callout>);

    const dangerClass = (dangerContainer.firstChild as HTMLElement).className;
    const warningClass = (warningContainer.firstChild as HTMLElement).className;

    expect(dangerClass).not.toBe(warningClass);
    expect(dangerClass).toMatch(/red/);
    expect(warningClass).toMatch(/amber/);
  });

  it("forwards role for alert/status semantics when provided", () => {
    render(
      <Callout tone="warning" role="alert">
        Perhatian
      </Callout>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
