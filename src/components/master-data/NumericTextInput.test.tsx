// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumericTextInput, NumericTextInputControlled } from "./NumericTextInput";

// Covers the LOCK's numeric-input audit matrix: empty, "0", large numbers,
// formatted/unformatted paste, backspace, invalid characters, submit, and
// editing an existing value — for both the uncontrolled (hidden-input-backed)
// and controlled variants that cover every numeric field in the app.
describe("NumericTextInput — uncontrolled masked input + hidden raw value", () => {
  function renderInForm(props: Partial<React.ComponentProps<typeof NumericTextInput>> = {}) {
    render(
      <form aria-label="test-form">
        <NumericTextInput name="amount" ariaLabel="Nominal" {...props} />
      </form>,
    );
    const visible = screen.getByLabelText("Nominal") as HTMLInputElement;
    const hidden = document.querySelector('input[name="amount"][type="hidden"]') as HTMLInputElement;
    return { visible, hidden };
  }

  it("starts empty when no defaultValue is given", () => {
    const { visible, hidden } = renderInForm();
    expect(visible.value).toBe("");
    expect(hidden.value).toBe("");
  });

  it("accepts 0 and keeps the raw value as a plain 0", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.type(visible, "0");
    expect(visible.value).toBe("0");
    expect(hidden.value).toBe("0");
  });

  it("formats a large number with Indonesian thousand separators while keeping the raw digits underneath", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.type(visible, "12500000");
    expect(visible.value).toBe("12.500.000");
    expect(hidden.value).toBe("12500000");
  });

  it("normalizes a pasted, already-formatted number to the same raw digits", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.click(visible);
    await user.paste("1.500.000");
    expect(visible.value).toBe("1.500.000");
    expect(hidden.value).toBe("1500000");
  });

  it("normalizes a pasted, unformatted number to the same raw digits", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.click(visible);
    await user.paste("1500000");
    expect(visible.value).toBe("1.500.000");
    expect(hidden.value).toBe("1500000");
  });

  it("reformats correctly after backspace/delete", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.type(visible, "1500000");
    expect(visible.value).toBe("1.500.000");
    await user.type(visible, "{backspace}{backspace}");
    expect(visible.value).toBe("15.000");
    expect(hidden.value).toBe("15000");
  });

  it("strips invalid (non-digit) characters as they are typed", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm();
    await user.type(visible, "Rp12a3b4,5.6");
    expect(visible.value).toBe("123.456");
    expect(hidden.value).toBe("123456");
  });

  it("edits an existing (defaultValue) value and keeps it formatted", async () => {
    const user = userEvent.setup();
    const { visible, hidden } = renderInForm({ defaultValue: 500000 });
    expect(visible.value).toBe("500.000");
    expect(hidden.value).toBe("500000");
    await user.type(visible, "1");
    expect(visible.value).toBe("5.000.001");
    expect(hidden.value).toBe("5000001");
  });

  it("submits the raw digit string via the hidden input's name, not the formatted display value", async () => {
    const user = userEvent.setup();
    let submittedAmount: string | null = null;
    render(
      <form
        aria-label="submit-form"
        onSubmit={(event) => {
          event.preventDefault();
          submittedAmount = new FormData(event.currentTarget).get("amount") as string;
        }}
      >
        <NumericTextInput name="amount" ariaLabel="Nominal" />
        <button type="submit">Simpan</button>
      </form>,
    );
    await user.type(screen.getByLabelText("Nominal"), "2500000");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(submittedAmount).toBe("2500000");
  });
});

describe("NumericTextInputControlled — lifted raw-value state", () => {
  function ControlledHarness() {
    const [value, setValue] = useState("");
    return (
      <>
        <NumericTextInputControlled rawValue={value} onRawValueChange={setValue} ariaLabel="Nominal" />
        <span data-testid="raw">{value}</span>
      </>
    );
  }

  it("starts empty, formats large typed values, and exposes the raw digits to the parent", async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const input = screen.getByLabelText("Nominal") as HTMLInputElement;
    expect(input.value).toBe("");

    await user.type(input, "0");
    expect(input.value).toBe("0");
    expect(screen.getByTestId("raw").textContent).toBe("0");

    await user.clear(input);
    await user.type(input, "3000000");
    expect(input.value).toBe("3.000.000");
    expect(screen.getByTestId("raw").textContent).toBe("3000000");
  });

  it("strips invalid characters and reformats after backspace, same as the uncontrolled variant", async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const input = screen.getByLabelText("Nominal") as HTMLInputElement;

    await user.type(input, "ab1c2d3");
    expect(input.value).toBe("123");

    await user.type(input, "{backspace}");
    expect(input.value).toBe("12");
  });
});
