// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("starts collapsed by default and expands on click, exposing aria-expanded/aria-controls", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Tambah PIC">
        <input aria-label="Nama PIC" defaultValue="" />
      </Disclosure>,
    );

    const trigger = screen.getByRole("button", { name: /Tambah PIC/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const contentId = trigger.getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId!)).toHaveAttribute("hidden");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(contentId!)).not.toHaveAttribute("hidden");
  });

  it("defaults open when defaultOpen is set", () => {
    render(
      <Disclosure title="Identitas Client" defaultOpen>
        <p>isi</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: /Identitas Client/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps children mounted while collapsed so entered values are never dropped", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Tambah PIC">
        <input aria-label="Nama PIC" defaultValue="Budi" />
      </Disclosure>,
    );

    const input = screen.getByLabelText("Nama PIC") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "Siti");

    const trigger = screen.getByRole("button", { name: /Tambah PIC/ });
    await user.click(trigger); // expand
    expect(screen.getByLabelText("Nama PIC")).toHaveValue("Siti");
    await user.click(trigger); // collapse again
    expect(input.value).toBe("Siti");
    await user.click(trigger); // expand again
    expect(screen.getByLabelText("Nama PIC")).toHaveValue("Siti");
  });

  it("shows a completion summary and an error badge in the header", () => {
    render(
      <Disclosure title="PIC / Contact" summary="3/5 lengkap" hasError>
        <p>isi</p>
      </Disclosure>,
    );
    expect(screen.getByText("3/5 lengkap")).toBeInTheDocument();
    expect(screen.getByText("Perlu diperiksa")).toBeInTheDocument();
  });

  it("force-expands when forceOpen flips true, e.g. after a failed submit", () => {
    function Harness() {
      const [hasError, setHasError] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setHasError(true)}>
            trigger error
          </button>
          <Disclosure title="Tambah PIC" forceOpen={hasError}>
            <p>isi</p>
          </Disclosure>
        </>
      );
    }
    render(<Harness />);

    const disclosureTrigger = screen.getByRole("button", { name: /Tambah PIC/ });
    expect(disclosureTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "trigger error" }));
    expect(disclosureTrigger).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the user's manual collapse after forceOpen has already fired once", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure title="Tambah PIC" forceOpen>
        <p>isi</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: /Tambah PIC/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
