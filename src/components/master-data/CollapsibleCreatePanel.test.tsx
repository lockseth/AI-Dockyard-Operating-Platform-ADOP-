// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleCreatePanel } from "./CollapsibleCreatePanel";

describe("CollapsibleCreatePanel", () => {
  it("has an accessible name that clearly states the add action, and swaps to a close label when expanded", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleCreatePanel label="Tambah Client">
        <input aria-label="Nama Client" defaultValue="" />
      </CollapsibleCreatePanel>,
    );

    const trigger = screen.getByRole("button", { name: "Tambah Client" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Tutup Form Client" })).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to a generic close label when the entity can't be parsed out of a non-'Tambah X' label", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleCreatePanel label="Buat Draft Invoice">
        <p>isi</p>
      </CollapsibleCreatePanel>,
    );
    await user.click(screen.getByRole("button", { name: "Buat Draft Invoice" }));
    expect(screen.getByRole("button", { name: "Tutup Buat Draft Invoice" })).toBeInTheDocument();
  });

  it("forwards forceOpen/hasError so a failed submit re-expands the panel with an error badge", () => {
    render(
      <CollapsibleCreatePanel label="Tambah Kapal" forceOpen hasError>
        <p>isi</p>
      </CollapsibleCreatePanel>,
    );
    const trigger = screen.getByRole("button", { name: /Tutup Form Kapal/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Perlu diperiksa")).toBeInTheDocument();
  });
});
