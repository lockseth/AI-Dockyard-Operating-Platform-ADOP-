// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelectField, TextField } from "./fields";

describe("SelectField — shared dropdown accessibility (LOCK Gate 4)", () => {
  const options = [
    { value: "a", label: "Opsi A" },
    { value: "b", label: "Opsi B" },
  ];

  it("has a visible focus ring class and no reliance on color alone", () => {
    render(<SelectField label="Pilihan" name="pilihan" options={options} />);
    const select = screen.getByLabelText("Pilihan");
    expect(select.className).toMatch(/focus:ring-2/);
    expect(select.className).toMatch(/focus:border-blue-500/);
  });

  it("marks the selected option via defaultValue so the current selection is readable", () => {
    render(<SelectField label="Pilihan" name="pilihan" defaultValue="b" options={options} />);
    const select = screen.getByLabelText("Pilihan") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("renders as disabled with a distinct opacity/cursor class, not just plain text", () => {
    render(<SelectField label="Pilihan" name="pilihan" options={options} disabled />);
    const select = screen.getByLabelText("Pilihan") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.className).toMatch(/disabled:bg-slate-50/);
    expect(select.className).toMatch(/disabled:text-slate-400/);
    expect(select.className).toMatch(/disabled:cursor-not-allowed/);
  });

  it("marks aria-invalid and applies an error border class when field errors are present", () => {
    render(<SelectField label="Pilihan" name="pilihan" options={options} errors={["Wajib dipilih."]} />);
    const select = screen.getByLabelText("Pilihan");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.className).toMatch(/aria-\[invalid=true\]:border-red-500/);
    expect(screen.getByText("Wajib dipilih.")).toBeInTheDocument();
  });

  it("does not mark aria-invalid=true when there are no errors", () => {
    render(<SelectField label="Pilihan" name="pilihan" options={options} />);
    const select = screen.getByLabelText("Pilihan");
    expect(select.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("supports a custom placeholder for the empty option", () => {
    render(<SelectField label="Project" name="projectId" options={options} placeholder="Semua Project" />);
    expect(screen.getByRole("option", { name: "Semua Project" })).toBeInTheDocument();
  });
});

describe("TextField — shared disabled/error state (LOCK Gate 4)", () => {
  it("renders as disabled with a distinct opacity/cursor class", () => {
    render(<TextField label="Nama" name="nama" disabled />);
    const input = screen.getByLabelText("Nama") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.className).toMatch(/disabled:bg-neutral-50/);
    expect(input.className).toMatch(/disabled:text-neutral-400/);
    expect(input.className).toMatch(/disabled:cursor-not-allowed/);
  });

  it("marks aria-invalid when field errors are present", () => {
    render(<TextField label="Nama" name="nama" errors={["Wajib diisi."]} />);
    expect(screen.getByLabelText("Nama")).toHaveAttribute("aria-invalid", "true");
  });
});
